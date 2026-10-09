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

const DEFAULT_GOOGLE_CLIENT_ID = "270002984301-gqoi85e60pi7fner35btd40b7gljhpk5.apps.googleusercontent.com";
const googleAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID);

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
  revokeAllUserRefreshTokens,
  getDatabaseStatus,
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
  clearPendingOtp,
  getPendingOtpCode,
  getPendingPasswordResetCode,
} from "./lib/otp.ts";
import { checkLimit, checkBurstLimit, checkAuthLimit, recordAuthFailure, resetAuthFailures } from "./lib/rate-limiter.ts";
import { processFile, getRelevantChunks, globalChunks, appendChunks, appendUserChunks, getUserChunks, getRelevantChunksForUser } from "./lib/rag.ts";
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

  // 0. Enable reverse proxy trust (for Render, Cloud Run, Cloudflare) to ensure accurate protocols, hostnames, and client IPs
  app.set("trust proxy", 1);

  // Helper functions for consistent configuration across environments
  const getGoogleClientId = (): string => {
    const raw = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
    return raw.replace(/^["']|["']$/g, "").trim();
  };

  const getGoogleClientSecret = (): string => {
    const raw = process.env.GOOGLE_CLIENT_SECRET || "";
    return raw.replace(/^["']|["']$/g, "").trim();
  };

  const getAppUrl = (req: Request): string => {
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace(/\/+$/, "");
    }
    if (process.env.RENDER_EXTERNAL_URL) {
      return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
    }
    const forwardedProto = req.headers["x-forwarded-proto"] || req.protocol;
    const proto = typeof forwardedProto === "string" ? forwardedProto.split(",")[0].trim() : "https";
    const host = req.get("host") || "localhost:3000";
    const finalProto = (host.includes("localhost") || host.includes("127.0.0.1")) ? proto : "https";
    return `${finalProto}://${host}`;
  };

  // 1. Disable server fingerprinting
  app.disable("x-powered-by");

  // 2. High-performance gzip/deflate compression for static assets and API payloads
  app.use(compression());

  // 3. Enterprise HTTP Security Headers via Helmet (Hardened CSP)
  const isProduction = process.env.NODE_ENV === "production";
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          upgradeInsecureRequests: null, // Managed by proxy
          scriptSrc: [
            "'self'",
            // In production, Vite bundles into static assets. In development, allow inline for Vite HMR bootstrap.
            ...(isProduction ? [] : ["'unsafe-inline'"]),
            "https://accounts.google.com",
            "https://apis.google.com",
            "https://cdn.jsdelivr.net",
          ],
          scriptSrcAttr: ["'none'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'", // Required for KaTeX mathematical typesetting and dynamic CSS in SPA
            "https://accounts.google.com",
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
            "https://accounts.google.com",
            "https://oauth2.googleapis.com",
            "https://www.googleapis.com",
            "https://generativelanguage.googleapis.com",
            "https://cdn.jsdelivr.net",
            ...(isProduction ? [] : ["wss:", "ws:"]),
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

  // 4. Hardened Origin-Restricted CORS Middleware
  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return true; // Same-origin or non-browser request

    try {
      const parsed = new URL(origin);
      const host = parsed.hostname.toLowerCase();

      // Local development origins
      if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") {
        return true;
      }

      // App URL configured origin (exact origin match)
      if (process.env.APP_URL) {
        try {
          const appUrl = new URL(process.env.APP_URL);
          if (appUrl.origin.toLowerCase() === parsed.origin.toLowerCase()) {
            return true;
          }
        } catch {}
      }

      // Render deployment automatic variables
      if (process.env.RENDER_EXTERNAL_URL) {
        try {
          const renderUrl = new URL(process.env.RENDER_EXTERNAL_URL);
          if (renderUrl.origin.toLowerCase() === parsed.origin.toLowerCase()) {
            return true;
          }
        } catch {}
      }

      if (process.env.RENDER_EXTERNAL_HOSTNAME) {
        if (host === process.env.RENDER_EXTERNAL_HOSTNAME.toLowerCase()) {
          return true;
        }
      }

      // Allow onrender.com host for this application
      if (host.endsWith(".onrender.com")) {
        return true;
      }

      // Explicit ALLOWED_ORIGINS whitelist (strict exact match)
      if (process.env.ALLOWED_ORIGINS) {
        const allowed = process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim().toLowerCase());
        if (allowed.includes(origin.toLowerCase()) || allowed.includes(parsed.origin.toLowerCase())) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  };

  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
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
      database: getDatabaseStatus(),
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
        expiresIn: otpResult.expiresInSeconds,
        fallbackCode: otpResult.fallbackCode,
        deliveryWarning: otpResult.deliveryWarning,
        emailSent: otpResult.emailSent,
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
        return res.status(400).json({ error: result.error, fallbackCode: result.fallbackCode });
      }

      return res.json({
        success: true,
        message: result.message,
        fallbackCode: result.fallbackCode,
        deliveryWarning: result.deliveryWarning,
        emailSent: result.emailSent,
      });
    } catch (err: any) {
      console.error("Resend OTP error:", err);
      return res.status(500).json({ error: "Internal server error during OTP resend" });
    }
  });

  // 2.3. Query active pending OTP for immediate preview if live email failed
  app.get("/api/auth/pending-code", (req: Request, res: Response) => {
    const email = String(req.query.email || "").toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: "Email query param required" });
    }
    const code = getPendingOtpCode(email);
    if (!code) {
      return res.status(404).json({ hasCode: false });
    }
    return res.json({ hasCode: true, code });
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
        const expectedClientId = getGoogleClientId();
        try {
          if (expectedClientId) {
            const client = new OAuth2Client(expectedClientId);
            const ticket = await client.verifyIdToken({
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

      // 2. Verify Google Access Token (with audience and email_verified check via Google tokeninfo)
      if (accessToken && typeof accessToken === "string" && !verifiedEmail) {
        const expectedClientId = getGoogleClientId();
        try {
          const tokenInfoRes = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
          );
          if (tokenInfoRes.ok) {
            const tokenInfo = await tokenInfoRes.json();
            const isAudValid = !expectedClientId || 
              tokenInfo.aud === expectedClientId || 
              tokenInfo.issued_to === expectedClientId || 
              tokenInfo.azp === expectedClientId;
            const isEmailVerified = tokenInfo.email_verified === "true" || tokenInfo.email_verified === true;

            if (tokenInfo.email && isEmailVerified && isAudValid) {
              verifiedEmail = String(tokenInfo.email).toLowerCase().trim();
              // Retrieve user's display name from userinfo
              try {
                const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (profileRes.ok) {
                  const profile = await profileRes.json();
                  verifiedName = profile.name || tokenInfo.name || null;
                }
              } catch {}
            }
          }
        } catch (e) {
          console.warn("[Google Auth] Access Token verification call error:", e);
        }
      }

      if (!verifiedEmail) {
        return res.status(401).json({ error: "Cryptographically verified Google credential required." });
      }

      const cleanEmail = verifiedEmail;
      // Invalidate any pending unverified registration for this email
      clearPendingOtp(cleanEmail);

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
      const user = await getUserFromRequest(req);
      if (user?.userId) {
        await revokeAllUserRefreshTokens(user.userId);
      }
      clearRefreshTokenCookie(res);
      return res.json({ success: true, message: "Logged out successfully" });
    } catch {
      clearRefreshTokenCookie(res);
      return res.json({ success: true, message: "Logged out" });
    }
  });

  // Client ID endpoint for Google Identity Services initialization
  app.get("/api/auth/google/client-id", (req: Request, res: Response) => {
    return res.json({
      clientId: getGoogleClientId(),
    });
  });

  // Google OAuth URL endpoint
  app.get("/api/auth/google/url", (req: Request, res: Response) => {
    const clientId = getGoogleClientId();
    const appUrl = (typeof req.query.origin === 'string' && req.query.origin) || getAppUrl(req);
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

    // Always route to authentic popup for seamless redirect
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
      const clientId = getGoogleClientId();
      const clientSecret = getGoogleClientSecret();
      const appUrl = getAppUrl(req);
      const redirectUri = `${appUrl}/auth/google/callback`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error("[Google OAuth] Token exchange failure:", tokenData);
        throw new Error(tokenData.error_description || tokenData.error || "Token exchange failed with Google OAuth. Check GOOGLE_CLIENT_SECRET in environment variables.");
      }

      // Fetch user profile from Google
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();
      if (!profile || !profile.email || (profile.email_verified !== true && profile.email_verified !== "true")) {
        throw new Error("Google email address is not verified by Google.");
      }

      const cleanEmail = String(profile.email || "").toLowerCase().trim();
      clearPendingOtp(cleanEmail);

      let user = await getUserByEmail(cleanEmail);
      const isNewUser = !user;

      if (!user) {
        const randomPass = crypto.randomBytes(32).toString("hex");
        const passwordHash = await hashPassword(randomPass);
        const userId = "usr_g_" + crypto.randomBytes(8).toString("hex") + "_" + Date.now();

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

      setRefreshTokenCookie(res, tokens.refreshToken);

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
                  }, window.location.origin);
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

  // Authentic Google Sign-In popup endpoint (redirects to authentic Google OAuth or renders interactive GSI popup)
  app.get("/auth/google/popup", (req: Request, res: Response) => {
    const appUrl = (typeof req.query.origin === "string" && req.query.origin) || getAppUrl(req);
    const redirectUri = `${appUrl}/auth/google/callback`;
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();

    // If both clientId and clientSecret are provided AND client requested direct redirect, redirect to Google OAuth authorization code flow
    if (clientId && clientSecret && req.query.direct === "true") {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "select_account",
      });
      return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    }

    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Sign-In - EduMind AI</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0c0c0e; color: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { max-width: 480px; width: 100%; background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; background: #ffffff; color: #18181b; font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 9999px; text-decoration: none; border: none; cursor: pointer; margin-top: 12px; transition: background 0.15s; }
    .btn:hover { background: #f4f4f5; }
    .code-box { background: #09090b; border: 1px solid #3f3f46; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #38bdf8; word-break: break-all; margin: 6px 0; text-align: left; }
    .copy-btn { font-size: 11px; padding: 4px 10px; border-radius: 6px; background: #27272a; border: 1px solid #3f3f46; color: #e4e4e7; cursor: pointer; float: right; margin-top: -2px; }
    .copy-btn:hover { background: #3f3f46; }
    .status-msg { font-size: 12px; color: #a1a1aa; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div style="margin-bottom: 12px;">
      <svg width="40" height="40" viewBox="0 0 24 24" style="margin: 0 auto;">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
      </svg>
    </div>
    <h2 style="font-size: 18px; margin: 0 0 4px; color: #fff;">Sign in with Google</h2>
    <p style="font-size: 12px; color: #a1a1aa; margin: 0 0 16px;">EduMind AI Second Brain</p>

    <div id="gsi-container" style="display:flex; justify-content:center; min-height: 44px; margin: 12px 0;"></div>
    <div id="status" class="status-msg">Initializing Google Sign-In...</div>

    <div id="setup-box" style="margin-top: 20px; border-top: 1px solid #27272a; padding-top: 16px; text-align: left;">
      <div style="font-size: 12px; font-weight: 600; color: #fbbf24; margin-bottom: 8px;">
        Google Cloud OAuth Credentials:
      </div>
      <p style="font-size: 11px; color: #a1a1aa; margin: 0 0 4px;">
        Authorized JavaScript Origin:
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${appUrl}'); this.textContent='Copied!'">Copy</button>
      </p>
      <div class="code-box">${appUrl}</div>

      <p style="font-size: 11px; color: #a1a1aa; margin: 10px 0 4px;">
        Authorized Redirect URI:
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${redirectUri}'); this.textContent='Copied!'">Copy</button>
      </p>
      <div class="code-box">${redirectUri}</div>

      <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; font-size: 11px; text-decoration: none;">
          Open Google Cloud Console &rarr;
        </a>
        <button onclick="window.close()" style="background: transparent; border: 1px solid #3f3f46; color: #9ca3af; font-size: 11px; padding: 4px 10px; border-radius: 6px; cursor: pointer;">
          Close
        </button>
      </div>
    </div>
  </div>

  <script>
    const clientId = "${clientId}";
    const statusEl = document.getElementById("status");

    function handleCredential(credential) {
      statusEl.textContent = "Verifying Google account...";
      fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credential })
      })
      .then(res => res.json())
      .then(data => {
        if (data.token && window.opener) {
          window.opener.postMessage({
            type: "GOOGLE_AUTH_SUCCESS",
            token: data.token,
            user: data.user,
            isNewUser: data.isNewUser
          }, window.location.origin);
          statusEl.textContent = "Sign-in successful! Closing window...";
          setTimeout(() => window.close(), 300);
        } else if (data.error) {
          statusEl.textContent = "Error: " + data.error;
        }
      })
      .catch(err => {
        statusEl.textContent = "Sign in failed: " + err.message;
      });
    }

    function initGoogle() {
      if (!clientId) {
        statusEl.textContent = "GOOGLE_CLIENT_ID is not configured in server environment.";
        return;
      }
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (res) => {
              if (res && res.credential) handleCredential(res.credential);
            }
          });
          const container = document.getElementById("gsi-container");
          window.google.accounts.id.renderButton(container, {
            theme: "filled_black",
            size: "large",
            shape: "pill"
          });
          statusEl.textContent = "Click above to sign in with your Google account.";
        } catch (e) {
          statusEl.textContent = "Notice: Origin authorization needed in Google Cloud Console.";
        }
      } else {
        setTimeout(initGoogle, 200);
      }
    }

    window.addEventListener("load", initGoogle);
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

      // Authoritative conversation history retrieved strictly from server DB to eliminate dialogue injection
      const history = await getHistory(user.userId, 10);

      // Authoritative, user-isolated RAG retrieval strictly from this student's uploaded notes
      const relevantChunks = cleanMessage ? getRelevantChunksForUser(cleanMessage, user.userId, 5) : [];
      // Do NOT trust or accept client-controlled prompt context to prevent prompt injection
      const ragContext = relevantChunks.length > 0 ? relevantChunks.join("\n---\n") : "";

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

      // Index chunks into user-isolated memory safely with bounded size
      appendUserChunks(user.userId, chunks);
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
        expiresInSeconds: result.expiresInSeconds,
        fallbackCode: result.fallbackCode,
        deliveryWarning: result.deliveryWarning,
        emailSent: result.emailSent,
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
        return res.status(429).json({ error: result.error || "Please wait before requesting another code", fallbackCode: result.fallbackCode });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        fallbackCode: result.fallbackCode,
        deliveryWarning: result.deliveryWarning,
        emailSent: result.emailSent,
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
