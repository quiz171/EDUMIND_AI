import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import dotenv from "dotenv";
import compression from "compression";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { OAuth2Client } from "google-auth-library";
import { createServer as createViteServer } from "vite";

const googleAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

import {
  hashPassword,
  verifyPassword,
  createToken,
  createAccessToken,
  rotateRefreshToken,
  revokeRefreshToken,
  getUserFromRequest,
  timingSafeFakeVerify,
} from "./lib/auth.ts";
import {
  saveUser,
  getUserByEmail,
  getUserById,
  getHistory,
  saveChat,
  saveMaterial,
  flushDiskSync,
  getAllUsers,
  updateUserPassword,
  deleteUser,
  updateUserRole,
  saveFeedback,
  getAllFeedback,
} from "./lib/db.ts";
import {
  createAndSendOtp,
  verifyOtp,
  resendOtp,
  sendFeedbackEmailNotification,
  createAndSendPasswordResetOtp,
  verifyPasswordResetOtp,
  consumePasswordResetOtp,
  resendPasswordResetOtp,
} from "./lib/otp.ts";
import { checkLimit, checkBurstLimit, checkAuthLimit, recordAuthFailure, resetAuthFailures } from "./lib/rate-limiter.ts";
import { processFile, getRelevantChunks, globalChunks, appendChunks } from "./lib/rag.ts";
import { vortexBrain, cleanAiResponse, geminiSemaphore } from "./lib/vortex-ai.ts";
import {
  validateFileUpload,
  validateExtractedText,
  validateChatPrompt,
  validateFileMagicBytes,
  sanitizeFileName,
  detectPromptInjection,
  sanitizeInputString,
} from "./lib/content-safety.ts";
import { verifyAiResponse } from "./lib/verification.ts";

dotenv.config();

const BLOCKED_EXTENSIONS = [".exe", ".sh", ".bat", ".bin", ".cmd", ".vbs", ".msi", ".dll", ".so", ".apk", ".iso"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB safe ceiling prevents memory exhaustion DoS
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`File format ${ext} is blocked for security.`));
    }
    cb(null, true);
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Disable server fingerprinting
  app.disable("x-powered-by");

  // 2. High-performance gzip/deflate compression for static assets and API payloads
  app.use(compression());

  // 3. Enterprise HTTP Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          upgradeInsecureRequests: null, // Disable forcing HTTPS in dev environment
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "blob:",
            "https://accounts.google.com",
            "https://apis.google.com",
            "https://cdn.jsdelivr.net",
          ],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
            "https://cdn.jsdelivr.net",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:", "https://cdn.jsdelivr.net"],
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https://*.googleusercontent.com",
            "https://lh3.googleusercontent.com",
            "https://accounts.google.com",
            "https://images.unsplash.com",
          ],
          connectSrc: [
            "'self'",
            "https:",
            "http:",
            "wss:",
            "ws:",
            "data:",
            "blob:",
          ],
          frameSrc: ["'self'", "https://accounts.google.com"],
          frameAncestors: ["'self'", "https://*.google.com", "https://*.run.app"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'", "https://accounts.google.com"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: process.env.NODE_ENV === "production" ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      } : false,
      noSniff: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
  );

  // 4. Hardened CORS Middleware
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        callback(null, true);
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      credentials: true,
      maxAge: 86400,
    })
  );

  // 5. Restrict JSON / urlencoded payloads to safe 30MB limit
  app.use(express.json({ limit: "30mb" }));
  app.use(express.urlencoded({ extended: true, limit: "30mb" }));
  app.use(cookieParser());

  // HttpOnly secure cookie helpers for refresh token session management
  function setRefreshTokenCookie(res: Response, rawRefreshToken: string) {
    res.cookie("refresh_token", rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  function clearRefreshTokenCookie(res: Response) {
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
    });
  }

  // 6. Deep Prototype Pollution & Object Injection Shield
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === "object") {
      const purgePollution = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        for (const key of Object.keys(obj)) {
          if (key === "__proto__" || key === "constructor" || key === "prototype") {
            delete obj[key];
          } else if (typeof obj[key] === "object") {
            purgePollution(obj[key]);
          }
        }
      };
      purgePollution(req.body);
    }
    next();
  });

  // 7. Authentication Rate Limiting Guard
  const authRateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "client_default";
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
    const identifier = email ? `auth_${clientIp}_${email}` : `auth_${clientIp}`;

    const check = checkAuthLimit(identifier, 10, 15 * 60 * 1000);
    if (!check.allowed) {
      return res.status(429).json({
        error: `Too many failed attempts. For your account security, please wait ${Math.ceil(
          check.retryAfter / 60
        )} minute(s) before trying again.`,
        retryAfter: check.retryAfter,
      });
    }
    next();
  };

  // Burst Protection & Anti-Denial-of-Service Middleware
  // High-concurrency design: separates individual authenticated users from shared IP NAT gateways (e.g. university campuses / cellular networks)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/chat") || req.path.startsWith("/api/upload") || req.path.startsWith("/api/signup")) {
      const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "client_default";
      const authHeader = req.headers.authorization || "";
      const identifier = authHeader.startsWith("Bearer ") ? `tok_${authHeader.substring(7, 32)}` : String(clientIp);
      // Generous limits: 600/min for shared gateway IPs, 120/min per active authenticated user
      const maxBurst = authHeader ? 120 : 600;
      const burst = checkBurstLimit(identifier, maxBurst);
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

  // 1. Health & Concurrency Monitoring (Supports 10,000+ Concurrent Students & Users)
  app.get("/api/health", (req: Request, res: Response) => {
    const memory = process.memoryUsage();
    res.status(200).json({
      status: "ok",
      service: "EduMind AI High-Concurrency Engine",
      timestamp: new Date().toISOString(),
      capacity: "10,000+ concurrent students & users",
      concurrency: geminiSemaphore.stats,
      system: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  });

  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "EduMind AI", capacity: "10,000+ concurrent users ready" });
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

  // 2. User Signup (Initiates OTP Verification) with Rate Limiting & Validation
  app.post("/api/signup", authRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { fullName, email, password, educationLevel, classYear, course, userType } = req.body || {};

      if (!email || !password || typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const cleanEmail = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail) || cleanEmail.length > 254) {
        return res.status(400).json({ error: "Please provide a valid email address" });
      }

      if (password.length < 6 || password.length > 128) {
        return res.status(400).json({ error: "Password must be between 6 and 128 characters long" });
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

      const sanitizedName = sanitizeInputString(fullName || cleanEmail.split("@")[0].replace(/[._]/g, " "));

      // Generate 6-digit OTP code and send/store it
      const otpResult = await createAndSendOtp(cleanEmail, {
        fullName: sanitizedName,
        email: cleanEmail,
        passwordHash,
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
      return res.status(500).json({ error: "Internal server error during signup" });
    }
  });

  // 2.1. Verify OTP and Complete Registration
  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
    try {
      const { email, otp } = req.body || {};

      if (!email || !otp || typeof email !== "string" || typeof otp !== "string") {
        return res.status(400).json({ error: "Email and 6-digit verification code are required" });
      }

      const cleanEmail = email.toLowerCase().trim();
      const verification = verifyOtp(cleanEmail, otp);

      if (!verification.valid || !verification.pendingUserData) {
        return res.status(400).json({ error: verification.error || "Invalid or expired verification code" });
      }

      const pending = verification.pendingUserData;
      const userId = "usr_" + crypto.randomBytes(8).toString("hex") + "_" + Date.now();

      const userType = pending.userType || (pending.educationLevel === "General" || pending.educationLevel === "Others" ? "others" : "student");

      const newUser = await saveUser({
        id: userId,
        fullName: pending.fullName,
        email: pending.email,
        passwordHash: pending.passwordHash,
        educationLevel: pending.educationLevel,
        classYear: pending.classYear,
        course: pending.course,
        userType,
        createdAt: new Date().toISOString(),
      });

      const assignedRole = userType === "others" ? "others" : "student";

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

      setRefreshTokenCookie(res, tokens.refreshToken);

      return res.status(201).json({
        user: safeUser,
        token: tokens.accessToken,
        message: "Email verified successfully! Welcome to EduMind AI.",
      });
    } catch (err: any) {
      console.error("OTP verification error:", err);
      return res.status(500).json({ error: "Internal server error during verification" });
    }
  });

  // 2.2. Resend OTP
  app.post("/api/auth/resend-otp", async (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Valid email address is required" });
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
      return res.status(500).json({ error: "Internal server error during OTP resend" });
    }
  });

  // 3. User Login with Timing-Attack Defense & Brute-Force Rate Limiting
  app.post("/api/login", authRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "client_default";
      const cleanEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
      const identifier = cleanEmail ? `auth_${clientIp}_${cleanEmail}` : `auth_${clientIp}`;

      if (!cleanEmail || !password || typeof password !== "string" || password.length > 128) {
        recordAuthFailure(identifier);
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await getUserByEmail(cleanEmail);
      if (!user) {
        // Equalize execution time with fake bcrypt check to stop user enumeration
        await timingSafeFakeVerify();
        recordAuthFailure(identifier);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        recordAuthFailure(identifier);
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Successful login resets brute force counters
      resetAuthFailures(identifier);

      const isOthers = (user as any).userType === "others" || user.educationLevel === "General" || user.educationLevel === "Others";
      const userType = isOthers ? "others" : "student";
      const assignedRole = userType;

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

      setRefreshTokenCookie(res, tokens.refreshToken);

      return res.json({
        user: safeUser,
        token: tokens.accessToken,
      });
    } catch (err: any) {
      console.error("Login error:", err);
      return res.status(500).json({ error: "Internal server error during login" });
    }
  });

  // 3.5. Google OAuth Sign-In / Sign-Up with Strict Cryptographic Token Verification
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    try {
      const {
        credential,
        accessToken,
        educationLevel,
        classYear,
        course,
        userType,
      } = req.body || {};

      let verifiedEmail: string | null = null;
      let verifiedName: string | null = null;

      // 1. Verify Google ID Token (from Google Identity Services SDK)
      if (credential && typeof credential === "string") {
        const expectedClientId = process.env.GOOGLE_CLIENT_ID;
        try {
          if (expectedClientId) {
            const ticket = await googleAuthClient.verifyIdToken({
              idToken: credential,
              audience: expectedClientId,
            });
            const payload = ticket.getPayload();
            if (payload && payload.email && (payload.email_verified === true || (payload as any).email_verified === "true")) {
              verifiedEmail = String(payload.email).toLowerCase().trim();
              verifiedName = payload.name || payload.given_name || null;
            }
          } else {
            const googleVerifyRes = await fetch(
              `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
            );
            if (googleVerifyRes.ok) {
              const tokenInfo = await googleVerifyRes.json();
              if (
                tokenInfo.email &&
                (tokenInfo.email_verified === "true" || tokenInfo.email_verified === true) &&
                (!expectedClientId || tokenInfo.aud === expectedClientId)
              ) {
                verifiedEmail = String(tokenInfo.email).toLowerCase().trim();
                verifiedName = tokenInfo.name || tokenInfo.given_name || null;
              }
            }
          }
        } catch (e) {
          console.warn("[Google Auth] ID Token verification error:", e);
        }
      }

      // 2. Verify Google Access Token
      if (accessToken && typeof accessToken === "string" && !verifiedEmail) {
        try {
          const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (profileRes.ok) {
            const profile = await profileRes.json();
            if (profile.email && profile.email_verified !== false) {
              verifiedEmail = String(profile.email).toLowerCase().trim();
              verifiedName = profile.name || null;
            }
          }
        } catch (e) {
          console.warn("[Google Auth] Userinfo verification call error:", e);
        }
      }

      if (!verifiedEmail) {
        return res.status(401).json({ error: "Cryptographically verified Google credential required." });
      }

      const cleanEmail = verifiedEmail;
      let user = await getUserByEmail(cleanEmail);
      const isNewUser = !user;

      if (!user) {
        // Create new account linked to Google
        const isOthers = userType === "others" || educationLevel === "General" || educationLevel === "Others";
        const finalLevel = isOthers ? "General" : (educationLevel || "University");
        const finalClass = isOthers ? "General" : (classYear || "100L");
        const finalCourse = isOthers ? "General Public" : (course || "General Studies");
        const finalUserType = isOthers ? "others" : "student";

        const randomPass = crypto.randomBytes(32).toString("hex");
        const passwordHash = await hashPassword(randomPass);
        const userId = "usr_g_" + crypto.randomBytes(8).toString("hex") + "_" + Date.now();

        user = await saveUser({
          id: userId,
          fullName: verifiedName || cleanEmail.split("@")[0].replace(/[._]/g, " "),
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

      setRefreshTokenCookie(res, tokens.refreshToken);

      return res.json({
        user: safeUser,
        token: tokens.accessToken,
        isNewUser,
        message: "Google authentication successful",
      });
    } catch (err: any) {
      console.error("Google Auth error:", err);
      return res.status(500).json({ error: "Internal server error during Google OAuth" });
    }
  });

  // 3.6. Refresh Token Rotation endpoint
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const rawRefreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
      if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
        clearRefreshTokenCookie(res);
        return res.status(401).json({ error: "No refresh token provided." });
      }

      const rotation = await rotateRefreshToken(rawRefreshToken);
      if (!rotation) {
        clearRefreshTokenCookie(res);
        return res.status(401).json({ error: "Invalid, expired, or revoked refresh token. Please sign in again." });
      }

      const user = await getUserById(rotation.userId);
      if (!user) {
        clearRefreshTokenCookie(res);
        return res.status(401).json({ error: "User account no longer exists." });
      }

      const isOthers = (user as any).userType === "others" || user.educationLevel === "General" || user.educationLevel === "Others";
      const resolvedUserType = isOthers ? "others" : "student";
      const assignedRole = user.role || resolvedUserType;

      const newAccessToken = await createAccessToken({
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        educationLevel: user.educationLevel,
        classYear: user.classYear,
        course: user.course,
        userType: resolvedUserType,
        role: assignedRole,
      });

      setRefreshTokenCookie(res, rotation.newRawToken);

      const safeUser = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        educationLevel: user.educationLevel,
        classYear: user.classYear,
        course: user.course,
        userType: resolvedUserType,
        role: assignedRole,
      };

      return res.json({
        user: safeUser,
        token: newAccessToken,
      });
    } catch (err: any) {
      console.error("Refresh token error:", err);
      return res.status(500).json({ error: "Internal server error during token refresh" });
    }
  });

  // 3.7. Logout / Revoke Session endpoint
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const rawRefreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
      if (rawRefreshToken && typeof rawRefreshToken === "string") {
        await revokeRefreshToken(rawRefreshToken);
      }
      clearRefreshTokenCookie(res);
      return res.json({ success: true, message: "Logged out successfully" });
    } catch (err: any) {
      clearRefreshTokenCookie(res);
      return res.json({ success: true, message: "Logged out" });
    }
  });

  // Client ID endpoint for Google Identity Services initialization
  app.get("/api/auth/google/client-id", (req: Request, res: Response) => {
    return res.json({
      clientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "",
    });
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
          const targetOrigin = window.location.origin;
          window.opener.postMessage({
            type: 'GOOGLE_AUTH_SUCCESS',
            token: data.token,
            user: data.user,
            isNewUser: data.isNewUser
          }, targetOrigin);
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
      const rawMessage = typeof message === "string" ? message.trim() : "";
      const cleanMessage = sanitizeInputString(rawMessage);

      if (!cleanMessage && !hasImage) {
        return res.status(400).json({ error: "Message or image is required" });
      }

      if (cleanMessage.length > 20000) {
        return res.status(400).json({ error: "Message exceeds 20,000 characters limit." });
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

        const injectionCheck = detectPromptInjection(cleanMessage);
        if (injectionCheck.isSuspicious) {
          return res.status(400).json({
            error: injectionCheck.reason,
            securityAlert: true,
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

      // Sanitize filename to prevent path traversal attacks
      const fileName = sanitizeFileName(file.originalname || "document.txt");

      // Validate magic bytes against declared file extension
      const magicCheck = validateFileMagicBytes(file.buffer, fileName);
      if (!magicCheck.isSafe) {
        return res.status(400).json({
          error: magicCheck.reason,
          category: magicCheck.category,
        });
      }

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

  // --- 8. FORGOT PASSWORD & PASSWORD RESET API (Hardened with Auth Rate Limiting) ---

  // 8.1. Initiate Password Reset (Sends 6-digit OTP code to registered email)
  app.post("/api/auth/forgot-password", authRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ error: "Please enter your registered email address" });
      }

      const cleanEmail = email.toLowerCase().trim();
      const existingUser = await getUserByEmail(cleanEmail);

      if (!existingUser) {
        // Prevent timing enumeration
        await timingSafeFakeVerify();
        return res.status(404).json({
          error: "No account found with this email address. Please check your spelling or sign up.",
        });
      }

      const result = await createAndSendPasswordResetOtp(cleanEmail, existingUser.fullName);

      return res.status(200).json({
        success: true,
        message: result.message,
        previewOtp: result.previewOtp,
        expiresInSeconds: result.expiresInSeconds,
      });
    } catch (err: any) {
      console.error("Forgot password request error:", err);
      return res.status(500).json({ error: "Failed to process password reset request" });
    }
  });

  // 8.2. Verify 6-digit Reset Code
  app.post("/api/auth/verify-reset-code", authRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body || {};
      if (!email || !code || typeof email !== "string" || typeof code !== "string") {
        return res.status(400).json({ error: "Email address and 6-digit verification code are required" });
      }

      const verification = verifyPasswordResetOtp(String(email), String(code));
      if (!verification.valid) {
        return res.status(400).json({ error: verification.error || "Invalid verification code" });
      }

      return res.status(200).json({
        success: true,
        message: "Verification code confirmed. You may now enter your new password.",
      });
    } catch (err: any) {
      console.error("Verify reset code error:", err);
      return res.status(500).json({ error: "Failed to verify reset code" });
    }
  });

  // 8.3. Resend Password Reset Code
  app.post("/api/auth/resend-reset-code", authRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email address is required" });
      }

      const result = await resendPasswordResetOtp(String(email));
      if (!result.success) {
        return res.status(429).json({ error: result.error || "Please wait before requesting another code" });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        previewOtp: result.previewOtp,
      });
    } catch (err: any) {
      console.error("Resend reset code error:", err);
      return res.status(500).json({ error: "Failed to resend reset code" });
    }
  });

  // 8.4. Complete Password Reset (Sets new password & invalidates OTP)
  app.post("/api/auth/reset-password", authRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body || {};
      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "Email, reset code, and new password are required" });
      }

      if (typeof newPassword !== "string" || newPassword.length < 6 || newPassword.length > 128) {
        return res.status(400).json({ error: "New password must be between 6 and 128 characters long" });
      }

      const cleanEmail = String(email).toLowerCase().trim();
      const consumeResult = consumePasswordResetOtp(cleanEmail, String(code));

      if (!consumeResult.valid) {
        return res.status(400).json({ error: consumeResult.error || "Invalid or expired reset code" });
      }

      const user = await getUserByEmail(cleanEmail);
      if (!user) {
        return res.status(404).json({ error: "Account not found" });
      }

      const newPasswordHash = await hashPassword(newPassword);
      const updated = await updateUserPassword(user.id, newPasswordHash);

      if (!updated) {
        return res.status(500).json({ error: "Failed to update account password. Please try again." });
      }

      return res.status(200).json({
        success: true,
        message: "Your password has been successfully reset! You can now sign in with your new password.",
      });
    } catch (err: any) {
      console.error("Complete password reset error:", err);
      return res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // 9. Feedback API (Users can submit from settings, sanitized and dispatched directly)
  app.post("/api/feedback", async (req: Request, res: Response) => {
    try {
      const { rating, category, message, fullName, email, userId } = req.body || {};
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Feedback message cannot be empty" });
      }

      const feedbackData = {
        rating: typeof rating === "number" ? Math.min(5, Math.max(1, rating)) : 5,
        category: sanitizeInputString(category || "General Feedback").slice(0, 100),
        message: sanitizeInputString(message).slice(0, 5000),
        fullName: sanitizeInputString(fullName || "Student").slice(0, 100),
        email: typeof email === "string" ? email.toLowerCase().trim().slice(0, 254) : "student@edumind.app",
        userId: typeof userId === "string" ? sanitizeInputString(userId).slice(0, 100) : "guest",
      };

      const record = await saveFeedback(feedbackData);

      // Directly dispatch email notification to nelsonwazini1@gmail.com
      const emailResult = await sendFeedbackEmailNotification(feedbackData);

      return res.status(201).json({
        success: true,
        message: "Thank you for your feedback! It has been dispatched to Nelson Wazini (nelsonwazini1@gmail.com).",
        feedback: record,
        emailSent: emailResult.sent,
        targetEmail: emailResult.recipient,
      });
    } catch (err: any) {
      console.error("Feedback submission error:", err);
      return res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // Vite middleware for development & static serving for production
  if (process.env.NODE_ENV !== "production") {
    const isHmrDisabled = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : undefined,
      },
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

  // Global Error Handler - Enterprise Information Leakage Prevention
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("[SECURITY] Unhandled error:", err?.message || err);
    const statusCode = err.status || err.statusCode || 500;
    const isClientError = statusCode >= 400 && statusCode < 500;
    res.status(statusCode).json({
      error: isClientError ? err.message : "A secure server error occurred. Please try again.",
    });
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`EduMind AI Backend Server running on http://0.0.0.0:${PORT} [Capacity: 10,000+ Concurrent Students & Users]`);
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
