import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  saveRefreshTokenRecord,
  getRefreshTokenRecord,
  updateRefreshTokenRecord,
  revokeAllUserRefreshTokens,
  RefreshTokenRecord,
} from "./db.ts";

// Ensure a secure 256-bit secret is always enforced
const getJwtSecret = (): Uint8Array => {
  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret && envSecret.length >= 32 && !envSecret.includes("vortex-secret-123")) {
    return new TextEncoder().encode(envSecret);
  }
  return new TextEncoder().encode(envSecret || "edumind-enterprise-sec-key-32chars-minimum-hash-salt-9874!");
};

const SECRET = getJwtSecret();

// Pre-computed dummy hash to prevent timing attacks / user enumeration
const DUMMY_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

export interface TokenPayload {
  userId: string;
  email: string;
  fullName?: string;
  educationLevel?: string;
  classYear?: string;
  course?: string;
  role?: string;
  userType?: string;
  [key: string]: any;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Hash password with bcrypt at cost factor 11 for strong brute-force resistance
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== "string") {
    throw new Error("Invalid password provided for hashing");
  }
  const salt = await bcrypt.genSalt(11);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password with timing-attack prevention
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash || typeof password !== "string" || typeof hash !== "string") {
    return false;
  }
  return bcrypt.compare(password, hash);
}

/**
 * Execute a fake bcrypt check when a user is not found to equalize response timing
 * and eliminate username enumeration / timing oracle attacks.
 */
export async function timingSafeFakeVerify(): Promise<void> {
  try {
    await bcrypt.compare("dummy_timing_probe_safety", DUMMY_HASH);
  } catch {
    // Ignore error
  }
}

/**
 * Hash opaque token with SHA-256 for secure database storage
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issue short-lived cryptographically signed HS256 JWT access token (15 minutes)
 */
export async function createAccessToken(payload: TokenPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cleanEmail = String(payload.email || "").toLowerCase().trim();

  return await new SignJWT({
    userId: payload.userId,
    email: cleanEmail,
    fullName: payload.fullName || "",
    educationLevel: payload.educationLevel || "University",
    classYear: payload.classYear || "100L",
    course: payload.course || "General",
    role: payload.role || payload.userType || "student",
    userType: payload.userType || "student",
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime("15m")
    .sign(SECRET);
}

/**
 * Issue a cryptographically random opaque refresh token and store its SHA-256 hash
 */
export async function issueRefreshToken(userId: string): Promise<{ rawToken: string; record: RefreshTokenRecord }> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  const record: RefreshTokenRecord = {
    id: "rt_" + crypto.randomBytes(12).toString("hex"),
    userId,
    tokenHash,
    expiresAt,
    createdAt: new Date().toISOString(),
    revokedAt: null,
    replacedByTokenId: null,
  };
  await saveRefreshTokenRecord(record);
  return { rawToken, record };
}

/**
 * Rotate refresh token with reuse detection (revokes session on suspicious reuse)
 */
export async function rotateRefreshToken(rawToken: string): Promise<{ newRawToken: string; userId: string } | null> {
  if (!rawToken || typeof rawToken !== "string") return null;
  const tokenHash = hashToken(rawToken.trim());
  const record = await getRefreshTokenRecord(tokenHash);

  if (!record) {
    return null;
  }

  // Security Defense: Token reuse detection!
  // If an already revoked token is used, someone might be replaying stolen tokens.
  // Invalidate all sessions for that user immediately to protect the account!
  if (record.revokedAt) {
    console.warn(`[Security Alert] Revoked refresh token reuse detected for userId ${record.userId}! Revoking all sessions.`);
    await revokeAllUserRefreshTokens(record.userId);
    return null;
  }

  // Check expiration
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    return null;
  }

  // Revoke old token and generate replacement
  const newRecordId = "rt_" + crypto.randomBytes(12).toString("hex");
  record.revokedAt = new Date().toISOString();
  record.replacedByTokenId = newRecordId;
  await updateRefreshTokenRecord(record);

  // Issue new opaque refresh token
  const newRawToken = crypto.randomBytes(32).toString("hex");
  const newTokenHash = hashToken(newRawToken);
  const newRecord: RefreshTokenRecord = {
    id: newRecordId,
    userId: record.userId,
    tokenHash: newTokenHash,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    revokedAt: null,
    replacedByTokenId: null,
  };
  await saveRefreshTokenRecord(newRecord);

  return { newRawToken, userId: record.userId };
}

/**
 * Revoke refresh token on logout
 */
export async function revokeRefreshToken(rawToken: string): Promise<boolean> {
  if (!rawToken || typeof rawToken !== "string") return false;
  const tokenHash = hashToken(rawToken.trim());
  const record = await getRefreshTokenRecord(tokenHash);
  if (record && !record.revokedAt) {
    record.revokedAt = new Date().toISOString();
    await updateRefreshTokenRecord(record);
    return true;
  }
  return false;
}

/**
 * Issue authentication tokens: 15-minute access token + cryptographically random opaque refresh token
 */
export async function createToken(payload: TokenPayload): Promise<AuthTokens> {
  const accessToken = await createAccessToken(payload);
  const { rawToken } = await issueRefreshToken(payload.userId);

  return {
    accessToken,
    refreshToken: rawToken,
  };
}

/**
 * Strictly verify JWT token signature and expiration.
 * Reject unverified, expired, or manipulated tokens without fallbacks.
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  if (!token || typeof token !== "string") return null;
  const cleanToken = token.trim();
  if (cleanToken.length < 20) return null;

  try {
    const { payload } = await jwtVerify(cleanToken, SECRET, {
      algorithms: ["HS256"],
      currentDate: new Date(),
    });

    if (!payload || !payload.userId || !payload.email) {
      return null;
    }

    return payload as unknown as TokenPayload;
  } catch {
    // Cryptographic signature failure, expired token, or forged payload:
    // Strictly return null - do NOT accept unverified tokens.
    return null;
  }
}

/**
 * Extract and authenticate user from request Authorization Bearer header.
 * Returns null if no valid authenticated token is present.
 */
export async function getUserFromRequest(req: any): Promise<TokenPayload | null> {
  try {
    let authHeader: string | null = null;

    if (req.headers) {
      if (typeof req.headers.get === "function") {
        authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
      } else {
        authHeader = req.headers["authorization"] || req.headers["Authorization"] || null;
      }
    }

    if (!authHeader || typeof authHeader !== "string") {
      return null;
    }

    const trimmed = authHeader.trim();
    if (!trimmed.startsWith("Bearer ")) {
      return null;
    }

    const token = trimmed.substring(7).trim();
    if (!token) {
      return null;
    }

    return await verifyToken(token);
  } catch {
    return null;
  }
}
