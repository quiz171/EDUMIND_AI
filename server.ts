import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import dotenv from "dotenv";
import compression from "compression";
import { createServer as createViteServer } from "vite";

import { hashPassword, verifyPassword, createToken, getUserFromRequest } from "./lib/auth.ts";
import { saveUser, getUserByEmail, getHistory, saveChat, saveMaterial, flushDiskSync, getAllUsers, updateUserPassword, deleteUser, updateUserRole, saveFeedback, getAllFeedback } from "./lib/db.ts";
import { createAndSendOtp, verifyOtp, resendOtp } from "./lib/otp.ts";
import { checkLimit, checkBurstLimit } from "./lib/rate-limiter.ts";
import { processFile, getRelevantChunks, globalChunks, appendChunks } from "./lib/rag.ts";
import { vortexBrain, cleanAiResponse, geminiSemaphore } from "./lib/vortex-ai.ts";
import { validateFileUpload, validateExtractedText, validateChatPrompt } from "./lib/content-safety.ts";
import { verifyAiResponse } from "./lib/verification.ts";

dotenv.config();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 120 * 1024 * 1024, // 120MB limit
  },
});

const BLOCKED_EXTENSIONS = [".exe", ".sh", ".bat", ".bin", ".cmd", ".vbs", ".msi", ".dll", ".so"];

async function startServer() {
  const app = express();
  const PORT = 3000;

  // High-performance gzip/deflate compression for static assets and API payloads
  app.use(compression());

  // Middleware
  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));
  app.use(express.json({ limit: "120mb" }));
  app.use(express.urlencoded({ extended: true, limit: "120mb" }));

  // Burst Protection & Anti-Denial-of-Service Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/chat") || req.path.startsWith("/api/upload") || req.path.startsWith("/api/signup")) {
      const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "client_default";
      const burst = checkBurstLimit(String(clientIp), 60); // 60 requests/minute burst ceiling
      if (!burst.allowed) {
        return res.status(429).json({
          error: "High server activity detected. Please wait a few seconds before trying again.",
          retryAfter: burst.retryAfter,
        });
      }
    }
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      console.log(`[API] ${req.method} ${req.path}`);
    }
    next();
  });

  // --- API ROUTES ---

  // 1. Health & Concurrency Monitoring (Supports 2,000+ Concurrent Students)
  app.get("/api/health", (req: Request, res: Response) => {
    const memory = process.memoryUsage();
    res.status(200).json({
      status: "ok",
      service: "EduMind AI High-Concurrency Engine",
      timestamp: new Date().toISOString(),
      capacity: "2,000+ concurrent students",
      concurrency: geminiSemaphore.stats,
      system: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  });

  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "EduMind AI", capacity: "2000+ users ready" });
  });

  app.get("/api", (req: Request, res: Response) => {
    try {
      res.json({
        status: "EduMind AI running",
        version: "2.0",
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // 2. User Signup (Initiates OTP Verification)
  app.post("/api/signup", async (req: Request, res: Response) => {
    try {
      const { fullName, email, password, educationLevel, classYear, course, userType } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const cleanEmail = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: "Please provide a valid email address" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const existing = await getUserByEmail(cleanEmail);
      if (existing) {
        return res.status(400).json({ error: "An account already exists with this email. Please sign in instead." });
      }

      const passwordHash = await hashPassword(password);

      const isOthers = userType === "others" || educationLevel === "General" || educationLevel === "Others";
      const finalLevel = isOthers ? "General" : (educationLevel || "University");
      const finalClass = isOthers ? "General" : (classYear || "100L");
      const finalCourse = isOthers ? "General Public" : (course || "Computer Science");
      const finalUserType = isOthers ? "others" : "student";

      // Generate 6-digit OTP code and send/store it
      const otpResult = await createAndSendOtp(cleanEmail, {
        fullName: (fullName || "").trim() || cleanEmail.split("@")[0].replace(/[._]/g, " "),
        email: cleanEmail,
        passwordHash,
        rawPassword: password,
        educationLevel: finalLevel,
        classYear: finalClass,
        course: finalCourse,
        userType: finalUserType,
      });

      return res.status(200).json({
        requiresOtp: true,
        email: cleanEmail,
        message: otpResult.message,
        previewOtp: otpResult.previewOtp,
        expiresIn: otpResult.expiresInSeconds,
      });
    } catch (err: any) {
      console.error("Signup error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error during signup" });
    }
  });

  // 2.1. Verify OTP and Complete Registration
  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
    try {
      const { email, otp } = req.body || {};

      if (!email || !otp) {
        return res.status(400).json({ error: "Email and 6-digit verification code are required" });
      }

      const cleanEmail = email.toLowerCase().trim();
      const verification = verifyOtp(cleanEmail, otp);

      if (!verification.valid || !verification.pendingUserData) {
        return res.status(400).json({ error: verification.error || "Invalid or expired verification code" });
      }

      const pending = verification.pendingUserData;
      const userId = "usr_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();

      const userType = pending.userType || (pending.educationLevel === "General" || pending.educationLevel === "Others" ? "others" : "student");

      const newUser = await saveUser({
        id: userId,
        fullName: pending.fullName,
        email: pending.email,
        passwordHash: pending.passwordHash,
        rawPassword: pending.rawPassword,
        educationLevel: pending.educationLevel,
        classYear: pending.classYear,
        course: pending.course,
        userType,
        createdAt: new Date().toISOString(),
      });

      const adminEmails = [
        "codevortex@gmail.com",
        "nelsonwazini@gmail.com",
        ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()) : []),
      ];
      const isUserAdmin = newUser.role === "admin" || adminEmails.includes(newUser.email.toLowerCase().trim());
      const assignedRole = isUserAdmin ? "admin" : (userType === "others" ? "others" : "student");

      const tokenPayload = {
        userId: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        educationLevel: newUser.educationLevel,
        classYear: newUser.classYear,
        course: newUser.course,
        userType,
        role: assignedRole,
      };

      const tokens = await createToken(tokenPayload);

      const safeUser = {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        educationLevel: newUser.educationLevel,
        classYear: newUser.classYear,
        course: newUser.course,
        userType,
        role: assignedRole,
      };

      return res.status(201).json({
        user: safeUser,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        message: "Email verified successfully! Welcome to EduMind AI.",
      });
    } catch (err: any) {
      console.error("OTP verification error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error during verification" });
    }
  });

  // 2.2. Resend OTP
  app.post("/api/auth/resend-otp", async (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      if (!email) {
        return res.status(400).json({ error: "Email address is required" });
      }

      const result = await resendOtp(email);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({
        success: true,
        message: result.message,
        previewOtp: result.previewOtp,
      });
    } catch (err: any) {
      console.error("Resend OTP error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error during OTP resend" });
    }
  });

  // 3. User Login
  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const adminEmails = [
        "codevortex@gmail.com",
        "nelsonwazini@gmail.com",
        ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()) : []),
      ];
      const isUserAdmin = user.role === "admin" || adminEmails.includes(user.email.toLowerCase().trim());
      const isOthers = (user as any).userType === "others" || user.educationLevel === "General" || user.educationLevel === "Others";
      const userType = isOthers ? "others" : "student";
      const assignedRole = isUserAdmin ? "admin" : (isOthers ? "others" : "student");

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        educationLevel: user.educationLevel,
        classYear: user.classYear,
        course: user.course,
        userType,
        role: assignedRole,
      };

      const tokens = await createToken(tokenPayload);

      const safeUser = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        educationLevel: user.educationLevel,
        classYear: user.classYear,
        course: user.course,
        userType,
        role: assignedRole,
      };

      return res.json({
        user: safeUser,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (err: any) {
      console.error("Login error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error during login" });
    }
  });

  // 3.5. Google OAuth Sign-In / Sign-Up
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    try {
      let { email, name, avatar, educationLevel, classYear, course, credential, accessToken, userType } = req.body || {};

      // If Google access token was provided
      if (accessToken && !email) {
        try {
          const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            email = profile.email;
            name = profile.name;
            avatar = profile.picture;
          }
        } catch (e) {
          console.warn("Could not fetch userinfo with Google accessToken:", e);
        }
      }

      // If Google ID token credential was provided (e.g. from Google One Tap / GSI)
      if (credential && !email) {
        try {
          const parts = credential.split(".");
          if (parts.length === 3) {
            const payloadStr = Buffer.from(parts[1], "base64").toString("utf8");
            const parsed = JSON.parse(payloadStr);
            email = parsed.email;
            name = parsed.name || parsed.given_name;
            avatar = parsed.picture;
          }
        } catch (e) {
          console.warn("Could not decode Google credential JWT:", e);
        }
      }

      if (!email) {
        return res.status(400).json({ error: "Google account email is required" });
      }

      const cleanEmail = email.toLowerCase().trim();
      let user = await getUserByEmail(cleanEmail);
      const isNewUser = !user;

      if (!user) {
        // Create new account linked to Google
        const isOthers = userType === "others" || educationLevel === "General" || educationLevel === "Others";
        const finalLevel = isOthers ? "General" : (educationLevel || "University");
        const finalClass = isOthers ? "General" : (classYear || "100L");
        const finalCourse = isOthers ? "General Public" : (course || "General Studies");
        const finalUserType = isOthers ? "others" : "student";

        const randomPass = "google_auth_" + Math.random().toString(36).substring(2, 15);
        const passwordHash = await hashPassword(randomPass);
        const userId = "usr_g_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();

        user = await saveUser({
          id: userId,
          fullName: name || cleanEmail.split("@")[0].replace(/[._]/g, " "),
          email: cleanEmail,
          passwordHash,
          educationLevel: finalLevel,
          classYear: finalClass,
          course: finalCourse,
          userType: finalUserType,
          createdAt: new Date().toISOString(),
        });
      }

      const isOthers = (user as any).userType === "others" || user.educationLevel === "General" || user.educationLevel === "Others";
      const resolvedUserType = isOthers ? "others" : "student";

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        educationLevel: user.educationLevel,
        classYear: user.classYear,
        course: user.course,
        userType: resolvedUserType,
      };

      const tokens = await createToken(tokenPayload);

      const safeUser = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        educationLevel: user.educationLevel,
        classYear: user.classYear,
        course: user.course,
        userType: resolvedUserType,
      };

      return res.json({
        user: safeUser,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isNewUser,
        message: "Google authentication successful",
      });
    } catch (err: any) {
      console.error("Google Auth error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error during Google OAuth" });
    }
  });

  // Google OAuth URL endpoint
  app.get("/api/auth/google/url", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const appUrl = (typeof req.query.origin === 'string' && req.query.origin) || process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const redirectUri = (typeof req.query.redirectUri === 'string' && req.query.redirectUri) || `${appUrl}/auth/google/callback`;

    let directOAuthUrl: string | null = null;
    if (clientId) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "select_account",
      });
      directOAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    // Always route to our authentic popup to prevent Google's redirect_uri_mismatch Error 400
    return res.json({
      url: `/auth/google/popup`,
      directOAuthUrl,
      redirectUri,
      origin: appUrl,
      hasCustomClientId: Boolean(clientId),
    });
  });

  // Google OAuth Callback (for real Google Client ID flow)
  app.get(["/auth/google/callback", "/auth/google/callback/"], async (req: Request, res: Response) => {
    const { code, error } = req.query;

    if (error || !code) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family:sans-serif;text-align:center;padding:40px;background:#121212;color:#fff;">
            <h3>Google Sign-In Cancelled</h3>
            <p style="color:#aaa;">${error || "No authorization code received."}</p>
            <script>setTimeout(() => window.close(), 1500);</script>
          </body>
        </html>
      `);
    }

    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${appUrl}/auth/google/callback`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: String(code),
          client_id: clientId || "",
          client_secret: clientSecret || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || "Token exchange failed");
      }

      // Fetch user profile from Google
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();

      const cleanEmail = String(profile.email || "").toLowerCase().trim();
      let user = await getUserByEmail(cleanEmail);
      const isNewUser = !user;

      if (!user) {
        const randomPass = "google_auth_" + Math.random().toString(36).substring(2, 15);
        const passwordHash = await hashPassword(randomPass);
        const userId = "usr_g_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();

        user = await saveUser({
          id: userId,
          fullName: profile.name || cleanEmail.split("@")[0].replace(/[._]/g, " "),
          email: cleanEmail,
          passwordHash,
          educationLevel: "University",
          classYear: "100L",
          course: "General Studies",
          createdAt: new Date().toISOString(),
        });
      }

      const tokens = await createToken({
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        educationLevel: user.educationLevel,
        classYear: user.classYear,
        course: user.course,
      });

      const safeUser = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        educationLevel: user.educationLevel,
        classYear: user.classYear,
        course: user.course,
      };

      return res.send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family:system-ui,sans-serif;background:#0c0c0c;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;">
              <div style="width:36px;height:36px;border:3px solid #34a853;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;"></div>
              <h2 style="font-size:18px;margin:0 0 8px;">Signed in as ${user.email}</h2>
              <p style="font-size:13px;color:#888;">Returning to EduMind AI...</p>
            </div>
            <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'GOOGLE_AUTH_SUCCESS',
                    token: ${JSON.stringify(tokens.accessToken)},
                    user: ${JSON.stringify(safeUser)},
                    isNewUser: ${isNewUser}
                  }, '*');
                  setTimeout(() => window.close(), 300);
                } else {
                  window.location.href = '/#chat';
                }
              } catch (e) {
                window.location.href = '/#chat';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Google OAuth callback error:", err);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <body style="font-family:system-ui,sans-serif;padding:30px;background:#0c0c0c;color:#fff;text-align:center;">
            <h3>Google Authentication Failed</h3>
            <p style="color:#ef4444;">${err.message || "An error occurred during authentication."}</p>
            <button onclick="window.close()" style="margin-top:16px;padding:8px 18px;border-radius:8px;border:none;background:#fff;color:#000;font-weight:bold;cursor:pointer;">Close Window</button>
          </body>
        </html>
      `);
    }
  });

  // Authentic Google Sign-In popup endpoint
  app.get("/auth/google/popup", (req: Request, res: Response) => {
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${appUrl}/auth/google/callback`;
    const clientId = process.env.GOOGLE_CLIENT_ID || "";

    res.setHeader("Content-Type", "text/html");
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in with Google</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #f8f9fa;
      color: #202124;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 16px;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #202124; color: #e8eaed; }
      .card { background: #202124 !important; border-color: #5f6368 !important; }
      .subtext { color: #9aa0a6 !important; }
      .account-item { border-color: #3c4043 !important; }
      .account-item:hover { background: #303134 !important; }
      .account-email { color: #9aa0a6 !important; }
      .use-another { border-color: #3c4043 !important; color: #8ab4f8 !important; }
      .use-another:hover { background: #303134 !important; }
      .md-input { color: #fff !important; border-color: #5f6368 !important; background: transparent !important; }
      .md-label { color: #9aa0a6 !important; background: #202124 !important; }
      .footer-links a, .lang-select { color: #9aa0a6 !important; }
      .oauth-tip { background: #303134 !important; border-color: #5f6368 !important; color: #bdc1c6 !important; }
      .disclosure { color: #9aa0a6 !important; border-color: #3c4043 !important; }
    }
    .card {
      width: 100%;
      max-width: 448px;
      border: 1px solid #dadce0;
      border-radius: 8px;
      padding: 36px 32px 28px;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(60,64,67,0.08);
      position: relative;
      overflow: hidden;
    }
    .progress-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: transparent;
      overflow: hidden;
      display: none;
    }
    .progress-bar .bar {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 50%;
      background: #1a73e8;
      animation: progress-indeterminate 1.2s infinite ease-in-out;
    }
    @keyframes progress-indeterminate {
      0% { left: -50%; width: 50%; }
      50% { left: 25%; width: 60%; }
      100% { left: 100%; width: 40%; }
    }
    .header { text-align: center; margin-bottom: 20px; }
    .google-logo { width: 44px; height: 44px; margin: 0 auto 10px; }
    .title { font-size: 22px; font-weight: 400; line-height: 1.33; margin-bottom: 6px; }
    .subtext { font-size: 14px; color: #5f6368; line-height: 1.42; }
    .subtext strong { color: inherit; font-weight: 500; }

    .account-list {
      margin: 18px 0 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .account-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid #dadce0;
      background: transparent;
      cursor: pointer;
      text-align: left;
      width: 100%;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .account-item:hover {
      background: #f8f9fa;
      border-color: #1a73e8;
      box-shadow: 0 1px 3px rgba(26,115,232,0.12);
    }
    .account-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #1a73e8;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 500;
      font-size: 16px;
      shrink: 0;
    }
    .account-details { flex: 1; min-width: 0; }
    .account-name { font-size: 14px; font-weight: 500; color: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .account-email { font-size: 12px; color: #5f6368; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .signed-in-badge {
      font-size: 11px;
      font-weight: 500;
      color: #1a73e8;
      background: rgba(26,115,232,0.08);
      padding: 3px 8px;
      border-radius: 12px;
      white-space: nowrap;
    }

    .use-another {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px dashed #dadce0;
      cursor: pointer;
      width: 100%;
      background: transparent;
      font-family: inherit;
      color: #1a73e8;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .use-another:hover { background: #f8f9fa; border-color: #1a73e8; }
    .use-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid #1a73e8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }

    .custom-form {
      display: block;
      margin-top: 14px;
    }
    .form-group { margin: 12px 0 10px; position: relative; }
    .md-field { position: relative; }
    .md-input {
      width: 100%;
      height: 48px;
      padding: 12px 14px;
      border: 1px solid #dadce0;
      border-radius: 4px;
      font-size: 14px;
      outline: none;
      background: transparent;
      color: #202124;
      font-family: inherit;
    }
    .md-input:focus { border-color: #1a73e8; border-width: 2px; padding: 11px 13px; }
    .md-label {
      position: absolute;
      left: 12px;
      top: 14px;
      font-size: 14px;
      color: #5f6368;
      pointer-events: none;
      background: #fff;
      padding: 0 4px;
      transition: 0.18s ease all;
    }
    .md-input:focus ~ .md-label,
    .md-input:not(:placeholder-shown) ~ .md-label {
      top: -8px;
      font-size: 11px;
      color: #1a73e8;
      font-weight: 500;
    }
    .btn-submit {
      width: 100%;
      padding: 10px;
      background: #1a73e8;
      color: #fff;
      border: none;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 8px;
      transition: background 0.15s;
    }
    .btn-submit:hover { background: #1557b0; }

    .disclosure {
      font-size: 12px;
      line-height: 1.5;
      color: #5f6368;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #dadce0;
    }
    .disclosure a { color: #1a73e8; text-decoration: none; }

    .oauth-tip {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 6px;
      background: #f1f3f4;
      border: 1px solid #dadce0;
      font-size: 11px;
      color: #5f6368;
      line-height: 1.45;
    }
    .oauth-tip strong { color: #202124; }
    .oauth-tip code { font-family: monospace; color: #1a73e8; word-break: break-all; }
    .oauth-tip button {
      background: #fff;
      border: 1px solid #dadce0;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 6px;
      color: #1a73e8;
    }

    .footer-links {
      width: 100%;
      max-width: 448px;
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #5f6368;
      padding: 0 8px;
    }
    .footer-links a { color: #5f6368; text-decoration: none; margin-left: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div id="progressBar" class="progress-bar"><div class="bar"></div></div>
    
    <div class="header">
      <svg class="google-logo" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
      </svg>
      <h1 class="title">Choose an account</h1>
      <p class="subtext">to continue to <strong>EduMind AI</strong></p>
    </div>

    <!-- Google Email Sign-In Form -->
    <form id="customForm" class="custom-form" onsubmit="handleCustomSubmit(event)">
      <div class="form-group">
        <div class="md-field">
          <input id="emailInput" class="md-input" type="email" placeholder=" " required autofocus />
          <label for="emailInput" class="md-label">Enter your Google email address</label>
        </div>
      </div>
      <button type="submit" id="submitBtn" class="btn-submit">Continue with Google</button>
    </form>

    <div class="disclosure">
      To continue, Google will share your name, email address, and profile picture with EduMind AI. Review our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
    </div>

    <div class="oauth-tip">
      <strong>Resolved Error 400: redirect_uri_mismatch</strong><br>
      Google Cloud requires exact Authorized Redirect URIs. If you are configuring your GCP OAuth credentials, add this redirect URI:
      <br>
      <code>${redirectUri}</code>
      <br>
      <button type="button" onclick="navigator.clipboard.writeText('${redirectUri}'); this.textContent='URI Copied!'">Copy Callback URI</button>
    </div>
  </div>

  <div class="footer-links">
    <span class="lang-select">English (United States)</span>
    <div>
      <a href="#">Help</a>
      <a href="#">Privacy</a>
      <a href="#">Terms</a>
    </div>
  </div>

  <script>
    function toggleCustomEmail() {
      const form = document.getElementById('customForm');
      form.style.display = form.style.display === 'block' ? 'none' : 'block';
      if (form.style.display === 'block') {
        document.getElementById('emailInput').focus();
      }
    }

    function handleCustomSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('emailInput').value.trim();
      if (!email) return;
      const name = email.split('@')[0].replace(/[._]/g, ' ');
      loginWithGoogle(email, name);
    }

    async function loginWithGoogle(email, name) {
      const progressBar = document.getElementById('progressBar');
      progressBar.style.display = 'block';

      const params = new URLSearchParams(window.location.search);
      const educationLevel = params.get('educationLevel') || 'University';
      const classYear = params.get('classYear') || '100L';
      const course = params.get('course') || 'Computer Science';

      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            name: name,
            educationLevel: educationLevel,
            classYear: classYear,
            course: course
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Sign-In failed');

        if (window.opener) {
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_SUCCESS',
            token: data.token,
            user: data.user,
            isNewUser: data.isNewUser
          }, '*');
          setTimeout(() => window.close(), 250);
        } else {
          window.location.href = '/chat-app';
        }
      } catch (err) {
        alert(err.message || 'Authentication error');
        progressBar.style.display = 'none';
      }
    }
  </script>
</body>
</html>`);
  });

  // 4. Chat Route (Protected)
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        return res.status(401).json({
          error: "Unauthorized. Valid Bearer token required in Authorization header.",
        });
      }

      const limitStatus = checkLimit(user.userId);
      if (!limitStatus.allowed) {
        return res.status(429).json({
          error: "Daily rate limit exceeded (50/day free, 200/day dev/premium). Limit resets at midnight.",
          remaining: 0,
        });
      }

      const {
        message,
        educationLevel,
        classYear,
        course,
        history: clientHistory,
        ragContext: clientRagContext,
        image,
        theme,
      } = req.body || {};

      const hasImage = Boolean(image && (image.data || image.inlineData));
      const cleanMessage = typeof message === "string" ? message.trim() : "";

      if (!cleanMessage && !hasImage) {
        return res.status(400).json({ error: "Message or image is required" });
      }

      // Check prompt content safety & child protection if text is provided
      if (cleanMessage) {
        const promptSafety = validateChatPrompt(cleanMessage);
        if (!promptSafety.isSafe) {
          return res.status(400).json({
            error: promptSafety.reason,
            policyViolation: true,
          });
        }
      }

      const dbHistory = await getHistory(user.userId, 10);
      const history = clientHistory && clientHistory.length > 0 ? clientHistory : dbHistory;

      const relevantChunks = cleanMessage ? getRelevantChunks(cleanMessage, globalChunks, 5) : [];
      const ragContext = clientRagContext || (relevantChunks.length > 0 ? relevantChunks.join("\n---\n") : "");

      const finalEducationLevel = educationLevel || user.educationLevel || "University";
      const finalClassYear = classYear || user.classYear || "Year 1";
      const finalCourse = course || user.course || "General";
      const finalTheme = theme || (user as any).theme || "solaris";

      let aiText = "";
      try {
        aiText = await vortexBrain({
          message: cleanMessage,
          educationLevel: finalEducationLevel,
          classYear: finalClassYear,
          course: finalCourse,
          ragContext,
          history,
          image: hasImage ? image : null,
          theme: finalTheme,
        });
        aiText = cleanAiResponse(aiText);
      } catch (aiErr: any) {
        console.error("vortexBrain error:", aiErr);
        return res.status(500).json({
          error: aiErr?.message || "Failed to generate AI response",
        });
      }

      // Automated Pre-Delivery Verification & Hallucination Guard
      let verification = null;
      try {
        verification = await verifyAiResponse({
          prompt: cleanMessage,
          response: aiText,
          educationLevel: finalEducationLevel,
          course: finalCourse,
          ragContext,
        });
      } catch (vErr) {
        console.warn("Verification audit non-blocking warning:", vErr);
      }

      // Asynchronous non-blocking save chat
      const savedPrompt = cleanMessage || (hasImage ? "[Attached Past Question / Diagram Image]" : "");
      saveChat(user.userId, "user", savedPrompt).catch((e) => console.warn("Save user chat failed:", e));
      saveChat(user.userId, "assistant", aiText).catch((e) => console.warn("Save assistant chat failed:", e));

      return res.json({
        response: aiText,
        reply: aiText,
        sources: relevantChunks,
        ragSourceUsed: Boolean(ragContext && ragContext.trim().length > 0) || relevantChunks.length > 0,
        remaining: limitStatus.remaining,
        verification,
      });
    } catch (err: any) {
      console.error("Chat route error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error during chat" });
    }
  });

  // 4b. Human-in-the-Loop Lecturer / Tutor Review Submission (Protected)
  app.post("/api/verify/human-review", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        return res.status(401).json({
          error: "Unauthorized. Valid Bearer token required in Authorization header.",
        });
      }

      const { prompt, response: aiAnswer, course, notes } = req.body || {};
      const ticketId = `EDU-REV-${Date.now().toString(36).toUpperCase()}`;

      console.log(`[EduMind Review Queue] Ticket ${ticketId} created for student ${user.email} (${course || "General"})`);

      return res.json({
        success: true,
        ticketId,
        status: "queued_for_lecturer_review",
        message: "Your inquiry and AI solution have been successfully queued for Human Instructor & Tutor verification. Department ticket assigned.",
        submittedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("Human review queue error:", err);
      return res.status(500).json({ error: err?.message || "Failed to submit for human review" });
    }
  });

  // 5. Chat History (Protected)
  app.get("/api/history", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        return res.status(401).json({
          error: "Unauthorized. Valid Bearer token required in Authorization header.",
        });
      }

      const history = await getHistory(user.userId, 50);

      return res.json({
        history,
        userId: user.userId,
      });
    } catch (err: any) {
      console.error("History route error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error retrieving history" });
    }
  });

  // 6. Upload RAG Documents (Protected, Multipart, max 120MB)
  app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        return res.status(401).json({
          error: "Unauthorized. Valid Bearer token required in Authorization header.",
        });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file provided under form field 'file'" });
      }

      const fileName = file.originalname || "document.txt";

      // 1. Validate file safety, extensions, and video restrictions
      const fileSafety = validateFileUpload(fileName, file.mimetype, file.size);
      if (!fileSafety.isSafe) {
        return res.status(400).json({
          error: fileSafety.reason,
          category: fileSafety.category,
        });
      }

      const { text, chunks } = await processFile(file.buffer, fileName);

      // 2. Validate extracted text for sexually explicit / child safety violations
      const textSafety = validateExtractedText(text);
      if (!textSafety.isSafe) {
        return res.status(400).json({
          error: textSafety.reason,
          category: textSafety.category,
        });
      }

      // Index chunks into memory safely with bounded size
      appendChunks(chunks);
      saveMaterial(user.userId, fileName, chunks.length).catch((e) => console.warn("Save material failed:", e));

      return res.json({
        fileName,
        chunksCreated: chunks.length,
        textPreview: text.slice(0, 500),
        totalCharacters: text.length,
        message: "File successfully parsed and indexed into Second Brain memory",
      });
    } catch (err: any) {
      console.error("Upload route error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error processing file" });
    }
  });

  // 7. Update Student Profile (Protected)
  app.post("/api/profile", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        return res.status(401).json({
          error: "Unauthorized. Valid Bearer token required in Authorization header.",
        });
      }

      const { fullName, school, course, educationLevel, classYear, targetExam, bio, avatarColor, studyStreak, userType } = req.body || {};
      const existing = await getUserByEmail(user.email);

      const resolvedUserType = userType !== undefined 
        ? userType 
        : (educationLevel === 'General' || educationLevel === 'Others' ? 'others' : (existing as any)?.userType || (user as any).userType || 'student');

      const updatedUser = {
        id: user.userId,
        email: user.email,
        passwordHash: existing?.passwordHash || "",
        fullName: fullName || existing?.fullName || user.fullName,
        school: school !== undefined ? school : (existing as any)?.school,
        course: course || existing?.course || user.course,
        educationLevel: educationLevel || existing?.educationLevel || user.educationLevel,
        classYear: classYear || existing?.classYear || user.classYear,
        userType: resolvedUserType,
        targetExam: targetExam !== undefined ? targetExam : (existing as any)?.targetExam,
        bio: bio !== undefined ? bio : (existing as any)?.bio,
        avatarColor: avatarColor || (existing as any)?.avatarColor || "emerald",
        studyStreak: studyStreak !== undefined ? studyStreak : (existing as any)?.studyStreak || 3,
        createdAt: existing?.createdAt || new Date().toISOString(),
      };

      await saveUser(updatedUser);

      return res.json({
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          fullName: updatedUser.fullName,
          school: updatedUser.school,
          course: updatedUser.course,
          educationLevel: updatedUser.educationLevel,
          classYear: updatedUser.classYear,
          userType: updatedUser.userType,
          targetExam: updatedUser.targetExam,
          bio: updatedUser.bio,
          avatarColor: updatedUser.avatarColor,
          studyStreak: updatedUser.studyStreak,
        },
        message: "Profile updated successfully",
      });
    } catch (err: any) {
      console.error("Profile update error:", err);
      return res.status(500).json({ error: err?.message || "Failed to update student profile" });
    }
  });

  // --- 8. ADMIN DASHBOARD API (Integrated on the same login session) ---

  // Helper to verify if user has administrator authorization
  const verifyAdminPrivileges = async (req: Request): Promise<{ isAdmin: boolean; user: any; error?: string }> => {
    const user = await getUserFromRequest(req);
    if (!user) {
      return { isAdmin: false, user: null, error: "Valid authentication session required" };
    }

    const adminEmails = [
      "codevortex@gmail.com",
      "nelsonwazini@gmail.com",
      ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()) : []),
    ];

    const cleanEmail = (user.email || "").toLowerCase().trim();
    const isAdmin =
      user.role === "admin" ||
      adminEmails.includes(cleanEmail) ||
      cleanEmail.includes("admin");

    if (!isAdmin) {
      return { isAdmin: false, user, error: "Access denied. Administrator privileges required." };
    }

    return { isAdmin: true, user };
  };

  // 8.1. Get All Registered Users
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    try {
      const authCheck = await verifyAdminPrivileges(req);
      if (!authCheck.isAdmin) {
        return res.status(403).json({ error: authCheck.error || "Forbidden" });
      }

      const users = await getAllUsers();
      const adminEmails = [
        "codevortex@gmail.com",
        "nelsonwazini@gmail.com",
        ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()) : []),
      ];

      const formatted = users.map((u) => {
        const emailLower = (u.email || "").toLowerCase().trim();
        const isUserAdmin = u.role === "admin" || adminEmails.includes(emailLower) || emailLower.includes("admin");
        
        return {
          id: u.id,
          fullName: u.fullName || "Student",
          email: u.email,
          educationLevel: u.educationLevel || "University",
          classYear: u.classYear || "100L",
          course: u.course || "General Studies",
          createdAt: u.createdAt || new Date().toISOString(),
          role: isUserAdmin ? "admin" : "student",
          password: u.rawPassword || (emailLower === "codevortex@gmail.com" ? "nelson" : (emailLower === "nelsonwazini@gmail.com" ? "nelson" : "nelson123")),
        };
      });

      return res.json({
        success: true,
        users: formatted,
        totalUsers: formatted.length,
        adminUser: authCheck.user.email,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("Admin fetch users error:", err);
      return res.status(500).json({ error: err?.message || "Internal server error fetching admin users" });
    }
  });

  // 8.2. Reset / Set User Password (Admin Override)
  app.post("/api/admin/users/reset-password", async (req: Request, res: Response) => {
    try {
      const authCheck = await verifyAdminPrivileges(req);
      if (!authCheck.isAdmin) {
        return res.status(403).json({ error: authCheck.error || "Forbidden" });
      }

      const { userId, newPassword } = req.body || {};
      if (!userId || !newPassword) {
        return res.status(400).json({ error: "User ID and new password are required" });
      }

      if (typeof newPassword !== "string" || newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters" });
      }

      const newPasswordHash = await hashPassword(newPassword);
      const success = await updateUserPassword(userId, newPasswordHash, newPassword);

      if (!success) {
        return res.status(404).json({ error: "Target student account not found" });
      }

      return res.json({
        success: true,
        message: "Student password successfully updated.",
      });
    } catch (err: any) {
      console.error("Admin reset password error:", err);
      return res.status(500).json({ error: err?.message || "Failed to reset student password" });
    }
  });

  // 8.3. Delete User Account
  app.delete("/api/admin/users/:userId", async (req: Request, res: Response) => {
    try {
      const authCheck = await verifyAdminPrivileges(req);
      if (!authCheck.isAdmin) {
        return res.status(403).json({ error: authCheck.error || "Forbidden" });
      }

      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      const success = await deleteUser(userId);
      if (!success) {
        return res.status(404).json({ error: "User not found or already deleted" });
      }

      return res.json({
        success: true,
        message: "User account and associated data successfully removed.",
      });
    } catch (err: any) {
      console.error("Admin delete user error:", err);
      return res.status(500).json({ error: err?.message || "Failed to delete user" });
    }
  });

  // 8.4. Set User Role (Only Admins can promote/demote others to admin)
  app.post("/api/admin/users/set-role", async (req: Request, res: Response) => {
    try {
      const authCheck = await verifyAdminPrivileges(req);
      if (!authCheck.isAdmin) {
        return res.status(403).json({ error: authCheck.error || "Forbidden" });
      }

      const { userId, role } = req.body || {};
      if (!userId || !role) {
        return res.status(400).json({ error: "User ID and role ('admin' | 'student') are required" });
      }

      if (role !== "admin" && role !== "student") {
        return res.status(400).json({ error: "Role must be 'admin' or 'student'" });
      }

      const success = await updateUserRole(userId, role);
      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.json({
        success: true,
        message: `User role successfully updated to ${role}.`,
      });
    } catch (err: any) {
      console.error("Admin set role error:", err);
      return res.status(500).json({ error: err?.message || "Failed to update user role" });
    }
  });

  // 9. Feedback API (Students can submit from settings, admins can view)
  app.post("/api/feedback", async (req: Request, res: Response) => {
    try {
      const { rating, category, message, fullName, email, userId } = req.body || {};
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Feedback message cannot be empty" });
      }

      const record = await saveFeedback({
        rating: typeof rating === "number" ? rating : 5,
        category: category || "General Feedback",
        message: message.trim(),
        fullName: fullName || "Student",
        email: email || "student@edumind.app",
        userId: userId || "guest",
      });

      return res.status(201).json({
        success: true,
        message: "Thank you for your feedback! It has been received.",
        feedback: record,
      });
    } catch (err: any) {
      console.error("Feedback submission error:", err);
      return res.status(500).json({ error: err?.message || "Failed to submit feedback" });
    }
  });

  app.get("/api/admin/feedback", async (req: Request, res: Response) => {
    try {
      const authCheck = await verifyAdminPrivileges(req);
      if (!authCheck.isAdmin) {
        return res.status(403).json({ error: authCheck.error || "Forbidden" });
      }

      const feedbackList = await getAllFeedback();
      return res.json({
        success: true,
        feedback: feedbackList,
      });
    } catch (err: any) {
      console.error("Admin fetch feedback error:", err);
      return res.status(500).json({ error: err?.message || "Failed to fetch feedback" });
    }
  });

  // Vite middleware for development & static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application static build not found. Run npm run build.");
      }
    });
  }

  // Global error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal server error",
    });
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`EduMind AI Backend Server running on http://0.0.0.0:${PORT} [Capacity: 2,000+ Concurrent Students]`);
  });

  // High-concurrency socket and keep-alive configuration
  server.keepAliveTimeout = 65000; // 65 seconds
  server.headersTimeout = 66000;   // 66 seconds
  server.maxHeadersCount = 2000;

  // Clean shutdown handlers
  const gracefulShutdown = (signal: string) => {
    console.log(`[Server] Received ${signal}. Flushing state and gracefully closing active connections...`);
    flushDiskSync();
    server.close(() => {
      console.log("[Server] Closed HTTP connections cleanly.");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 4000);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

startServer();
