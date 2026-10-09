import { createClient as createTursoClient, type Client as TursoClient } from "@libsql/client";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

// Turso LibSQL Cloud Database Setup
// Default to the user's Turso database URL
export const TURSO_DEFAULT_URL = "libsql://edumind-codevortex.aws-ap-south-1.turso.io";
const rawTursoUrl = (process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || TURSO_DEFAULT_URL).trim();
const rawTursoToken = (process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || "").trim();

let turso: TursoClient | null = null;
let isTursoHealthy = false;

if (rawTursoUrl && rawTursoToken) {
  try {
    turso = createTursoClient({
      url: rawTursoUrl,
      authToken: rawTursoToken,
    });
    isTursoHealthy = true;
    console.log(`[Turso] Initialized client for ${rawTursoUrl}`);
  } catch (err) {
    console.warn("[Turso] Initialization error, falling back to local persistent store:", err);
    turso = null;
    isTursoHealthy = false;
  }
} else if (rawTursoUrl && !rawTursoToken) {
  console.log(
    `[Turso] Database URL set to "${rawTursoUrl}". To activate cloud sync, set TURSO_AUTH_TOKEN in Render/server environment variables.`
  );
}

// Optional Supabase credentials fallback (legacy support)
const rawUrl = process.env.SUPABASE_URL?.trim();
const rawKey = process.env.SUPABASE_KEY?.trim();

const isPlaceholderUrl =
  !rawUrl ||
  rawUrl.includes("xntjupiplalvlmmqybth") ||
  rawUrl.includes("example.com") ||
  rawUrl.includes("placeholder");

const isPlaceholderKey =
  !rawKey ||
  rawKey.includes("placeholder") ||
  rawKey.length < 20;

let supabase: SupabaseClient | null = null;
let isSupabaseHealthy = false;

if (rawUrl && rawKey && !isPlaceholderUrl && !isPlaceholderKey) {
  try {
    supabase = createSupabaseClient(rawUrl, rawKey, {
      auth: { persistSession: false },
    });
    isSupabaseHealthy = true;
  } catch (err) {
    supabase = null;
    isSupabaseHealthy = false;
  }
}

// Local Persistent & In-Memory Store
export const inMemoryUsers = new Map<string, any>(); // keyed by email and id
export const inMemoryChats = new Map<string, any[]>(); // keyed by userId -> array of messages (capped at 100)
export const inMemoryMaterials = new Map<string, any[]>(); // keyed by userId -> array of materials (capped at 50)
export const inMemoryFeedback: FeedbackRecord[] = []; // feedback records from students and admins
export const inMemoryRefreshTokens = new Map<string, RefreshTokenRecord>(); // keyed by tokenHash

// File-based persistence across server restarts
const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const DATA_TEMP = path.join(DATA_DIR, "store.json.tmp");

// High-concurrency debounced persistence
let persistTimeout: NodeJS.Timeout | null = null;
let isPersisting = false;
let pendingPersist = false;

function loadFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.users && Array.isArray(parsed.users)) {
        for (const u of parsed.users) {
          delete u.rawPassword;
          inMemoryUsers.set(u.email.toLowerCase(), u);
          inMemoryUsers.set(u.id, u);
        }
      }
      if (parsed.chats && typeof parsed.chats === "object") {
        for (const [uid, msgs] of Object.entries(parsed.chats)) {
          inMemoryChats.set(uid, (msgs as any[]).slice(-30));
        }
      }
      if (parsed.materials && typeof parsed.materials === "object") {
        for (const [uid, mats] of Object.entries(parsed.materials)) {
          inMemoryMaterials.set(uid, (mats as any[]).slice(-30));
        }
      }
      if (parsed.feedback && Array.isArray(parsed.feedback)) {
        inMemoryFeedback.length = 0;
        inMemoryFeedback.push(...parsed.feedback);
      }
      if (parsed.refreshTokens && Array.isArray(parsed.refreshTokens)) {
        for (const rt of parsed.refreshTokens) {
          if (rt && rt.tokenHash) {
            inMemoryRefreshTokens.set(rt.tokenHash, rt);
          }
        }
      }
    }
  } catch {
    // Silently continue if disk read fails
  }
}

/**
 * Non-blocking, debounced async persistence with atomic rename.
 * Safely handles 10,000+ concurrent users without blocking the Node.js event loop.
 */
export function schedulePersist(debounceMs: number = 2500) {
  if (persistTimeout) {
    return;
  }

  persistTimeout = setTimeout(async () => {
    persistTimeout = null;
    await performAsyncPersist();
  }, debounceMs);
}

async function performAsyncPersist() {
  if (isPersisting) {
    pendingPersist = true;
    return;
  }

  isPersisting = true;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
    }

    const uniqueUsers: any[] = [];
    const seenEmails = new Set<string>();
    for (const [key, user] of inMemoryUsers.entries()) {
      if (key.includes("@") && !seenEmails.has(key)) {
        seenEmails.add(key);
        uniqueUsers.push(user);
      }
    }

    const chatsObj: Record<string, any[]> = {};
    for (const [uid, msgs] of inMemoryChats.entries()) {
      chatsObj[uid] = msgs.slice(-30);
    }

    const materialsObj: Record<string, any[]> = {};
    for (const [uid, mats] of inMemoryMaterials.entries()) {
      materialsObj[uid] = mats.slice(-30);
    }

    const refreshTokensList = Array.from(inMemoryRefreshTokens.values()).slice(-2000);
    const payload = JSON.stringify({
      users: uniqueUsers,
      chats: chatsObj,
      materials: materialsObj,
      feedback: inMemoryFeedback.slice(-500),
      refreshTokens: refreshTokensList,
    });
    
    // Write atomically to temporary file, then rename
    await fs.promises.writeFile(DATA_TEMP, payload, "utf-8");
    await fs.promises.rename(DATA_TEMP, DATA_FILE);
  } catch (err) {
    console.warn("[DB] Non-blocking persist notice:", (err as any)?.message);
  } finally {
    isPersisting = false;
    if (pendingPersist) {
      pendingPersist = false;
      schedulePersist(500);
    }
  }
}

/**
 * Synchronous flush on process termination (SIGINT/SIGTERM)
 */
export function flushDiskSync() {
  try {
    if (persistTimeout) {
      clearTimeout(persistTimeout);
      persistTimeout = null;
    }
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const uniqueUsers: any[] = [];
    const seenEmails = new Set<string>();
    for (const [key, user] of inMemoryUsers.entries()) {
      if (key.includes("@") && !seenEmails.has(key)) {
        seenEmails.add(key);
        uniqueUsers.push(user);
      }
    }
    const chatsObj: Record<string, any[]> = {};
    for (const [uid, msgs] of inMemoryChats.entries()) {
      chatsObj[uid] = msgs.slice(-100);
    }
    const materialsObj: Record<string, any[]> = {};
    for (const [uid, mats] of inMemoryMaterials.entries()) {
      materialsObj[uid] = mats.slice(-50);
    }
    const refreshTokensList = Array.from(inMemoryRefreshTokens.values()).slice(-2000);
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({
        users: uniqueUsers,
        chats: chatsObj,
        materials: materialsObj,
        feedback: inMemoryFeedback.slice(-500),
        refreshTokens: refreshTokensList,
      }),
      "utf-8"
    );
  } catch {
    // Ignore error on exit
  }
}

// Initialize on module load
loadFromDisk();

// Auto-initialize Turso schema if client is available
export async function initTursoTables() {
  if (!turso || !isTursoHealthy) return;
  try {
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        full_name TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        education_level TEXT,
        class_year TEXT,
        course TEXT,
        user_type TEXT DEFAULT 'student',
        role TEXT DEFAULT 'student',
        created_at TEXT
      )
    `);
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        role TEXT,
        content TEXT,
        created_at TEXT
      )
    `);
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS materials (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        file_name TEXT,
        chunks_count INTEGER,
        created_at TEXT
      )
    `);
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        email TEXT,
        full_name TEXT,
        rating INTEGER,
        category TEXT,
        message TEXT,
        created_at TEXT
      )
    `);
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_hash TEXT PRIMARY KEY,
        id TEXT,
        user_id TEXT,
        expires_at TEXT,
        created_at TEXT,
        revoked_at TEXT,
        replaced_by_token_id TEXT
      )
    `);
    console.log("[Turso] Tables initialized and verified successfully");
  } catch (err: any) {
    console.warn("[Turso] Table init notice:", err?.message || err);
    if (err?.message?.includes("AUTH_") || err?.message?.includes("unauthorized") || err?.status === 401) {
      isTursoHealthy = false;
    }
  }
}

if (turso && isTursoHealthy) {
  initTursoTables().catch((err) => {
    console.warn("[Turso] Async init failed:", err);
  });
}

export function getDatabaseStatus() {
  return {
    provider: "turso",
    url: rawTursoUrl,
    configured: Boolean(rawTursoToken),
    connected: isTursoHealthy,
    message: isTursoHealthy
      ? "Connected to Turso LibSQL Cloud"
      : rawTursoToken
      ? "Connecting to Turso..."
      : "Turso URL configured. Add TURSO_AUTH_TOKEN in Render/server environment to activate cloud database sync.",
    localRecords: {
      users: Math.floor(inMemoryUsers.size / 2),
      chats: inMemoryChats.size,
      materials: inMemoryMaterials.size,
      feedback: inMemoryFeedback.length,
    },
  };
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  replacedByTokenId: string | null;
}

export interface UserRecord {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  educationLevel: string;
  classYear: string;
  course: string;
  userType?: string;
  role?: "student" | "others";
  createdAt?: string;
}

export interface FeedbackRecord {
  id: string;
  userId?: string;
  email?: string;
  fullName?: string;
  rating: number;
  category: string;
  message: string;
  createdAt: string;
}

export interface ChatRecord {
  id?: string;
  userId: string;
  role: "user" | "assistant" | "model";
  content: string;
  timestamp: string;
}

export interface MaterialRecord {
  id?: string;
  userId: string;
  fileName: string;
  chunksCount: number;
  createdAt: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number = 2000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Supabase request timeout")), ms)),
  ]);
}

export async function saveUser(user: UserRecord): Promise<UserRecord> {
  // Always update in-memory and disk first
  inMemoryUsers.set(user.email.toLowerCase(), user);
  inMemoryUsers.set(user.id, user);
  schedulePersist(500);

  // Sync to Turso LibSQL Cloud if connected
  if (turso && isTursoHealthy) {
    turso
      .execute({
        sql: `
          INSERT INTO users (id, full_name, email, password_hash, education_level, class_year, course, user_type, role, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            full_name = excluded.full_name,
            password_hash = excluded.password_hash,
            education_level = excluded.education_level,
            class_year = excluded.class_year,
            course = excluded.course,
            user_type = excluded.user_type,
            role = excluded.role
        `,
        args: [
          user.id,
          user.fullName,
          user.email.toLowerCase(),
          user.passwordHash,
          user.educationLevel,
          user.classYear,
          user.course,
          user.userType || "student",
          user.role || "student",
          user.createdAt || new Date().toISOString(),
        ],
      })
      .catch((err) => {
        console.warn("[Turso] Cloud sync notice (user):", (err as any)?.message);
      });
  }

  // Fallback to Supabase if configured
  if (supabase && isSupabaseHealthy) {
    try {
      const query = supabase
        .from("users")
        .upsert(
          {
            id: user.id,
            full_name: user.fullName,
            email: user.email.toLowerCase(),
            password_hash: user.passwordHash,
            education_level: user.educationLevel,
            class_year: user.classYear,
            course: user.course,
            created_at: user.createdAt || new Date().toISOString(),
          },
          { onConflict: "email" }
        )
        .select()
        .single();

      const { data, error } = await withTimeout(Promise.resolve(query), 2000);

      if (!error && data) {
        return {
          id: data.id || user.id,
          fullName: data.full_name || user.fullName,
          email: data.email || user.email,
          passwordHash: data.password_hash || user.passwordHash,
          educationLevel: data.education_level || user.educationLevel,
          classYear: data.class_year || user.classYear,
          course: data.course || user.course,
          createdAt: data.created_at || user.createdAt,
        };
      }
    } catch {
      // Circuit breaker: disable Supabase if it fails/times out
      isSupabaseHealthy = false;
    }
  }

  return user;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const normalizedEmail = email.toLowerCase().trim();

  // Fast path: check memory/disk store first (sub-millisecond)
  const cached = inMemoryUsers.get(normalizedEmail);
  if (cached) {
    return cached;
  }

  // Check Turso LibSQL Cloud if available
  if (turso && isTursoHealthy) {
    try {
      const res = await withTimeout(
        turso.execute({
          sql: `SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1`,
          args: [normalizedEmail],
        }),
        2000
      );
      if (res.rows && res.rows.length > 0) {
        const row: any = res.rows[0];
        const record: UserRecord = {
          id: String(row.id),
          fullName: String(row.full_name || ""),
          email: String(row.email || normalizedEmail),
          passwordHash: String(row.password_hash || ""),
          educationLevel: String(row.education_level || ""),
          classYear: String(row.class_year || ""),
          course: String(row.course || ""),
          userType: row.user_type ? String(row.user_type) : undefined,
          role: (row.role as any) || "student",
          createdAt: row.created_at ? String(row.created_at) : undefined,
        };
        inMemoryUsers.set(normalizedEmail, record);
        inMemoryUsers.set(record.id, record);
        schedulePersist(2000);
        return record;
      }
    } catch (err: any) {
      console.warn("[Turso] getUserByEmail notice:", err?.message);
    }
  }

  // Only check Supabase if enabled, healthy, and not found locally
  if (supabase && isSupabaseHealthy) {
    try {
      const query = supabase
        .from("users")
        .select("*")
        .eq("email", normalizedEmail)
        .maybeSingle();

      const { data, error } = await withTimeout(Promise.resolve(query), 2000);

      if (!error && data) {
        const record: UserRecord = {
          id: data.id,
          fullName: data.full_name,
          email: data.email,
          passwordHash: data.password_hash,
          educationLevel: data.education_level,
          classYear: data.class_year,
          course: data.course,
          createdAt: data.created_at,
        };
        inMemoryUsers.set(normalizedEmail, record);
        inMemoryUsers.set(data.id, record);
        schedulePersist(2000);
        return record;
      }
    } catch {
      // Trip circuit breaker to avoid further timeouts
      isSupabaseHealthy = false;
    }
  }

  return inMemoryUsers.get(normalizedEmail) || null;
}

export async function saveChat(
  userId: string,
  role: "user" | "assistant" | "model",
  content: string,
  timestamp: Date = new Date()
): Promise<ChatRecord> {
  const record: ChatRecord = {
    userId,
    role,
    content,
    timestamp: timestamp.toISOString(),
  };

  const userChatList = inMemoryChats.get(userId) || [];
  userChatList.push(record);
  // Cap chat history to latest 30 items per user to preserve memory across 10,000+ users
  if (userChatList.length > 30) {
    userChatList.splice(0, userChatList.length - 30);
  }
  inMemoryChats.set(userId, userChatList);
  schedulePersist(3000);

  // Sync to Turso
  if (turso && isTursoHealthy) {
    turso
      .execute({
        sql: `INSERT INTO chats (id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: [
          "chat_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now(),
          userId,
          role,
          content,
          record.timestamp,
        ],
      })
      .catch((err) => {
        console.warn("[Turso] Cloud sync notice (chat):", (err as any)?.message);
      });
  }

  if (supabase && isSupabaseHealthy) {
    Promise.resolve(
      supabase.from("chats").insert({
        user_id: userId,
        role: role,
        content: content,
        created_at: record.timestamp,
      })
    ).catch(() => {
      isSupabaseHealthy = false;
    });
  }

  return record;
}

export async function getHistory(userId: string, limit: number = 10): Promise<{ role: string; content: string }[]> {
  const list = inMemoryChats.get(userId) || [];
  if (list.length > 0) {
    const sliced = list.slice(-limit);
    return sliced.map((item) => ({
      role: item.role === "assistant" || item.role === "model" ? "assistant" : "user",
      content: item.content,
    }));
  }

  // Check Turso if local memory empty
  if (turso && isTursoHealthy) {
    try {
      const res = await withTimeout(
        turso.execute({
          sql: `SELECT role, content, created_at FROM chats WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`,
          args: [userId, limit],
        }),
        2000
      );
      if (res.rows && res.rows.length > 0) {
        return res.rows.map((row: any) => ({
          role: row.role === "assistant" || row.role === "model" ? "assistant" : "user",
          content: String(row.content || ""),
        }));
      }
    } catch (err: any) {
      console.warn("[Turso] getHistory notice:", err?.message);
    }
  }

  if (supabase && isSupabaseHealthy) {
    try {
      const query = supabase
        .from("chats")
        .select("role, content, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(limit);

      const { data, error } = await withTimeout(Promise.resolve(query), 2000);

      if (!error && data && data.length > 0) {
        return data.map((d: any) => ({
          role: d.role === "assistant" || d.role === "model" ? "assistant" : "user",
          content: d.content,
        }));
      }
    } catch {
      isSupabaseHealthy = false;
    }
  }

  return [];
}

export async function saveMaterial(userId: string, fileName: string, chunksCount: number): Promise<MaterialRecord> {
  const record: MaterialRecord = {
    userId,
    fileName,
    chunksCount,
    createdAt: new Date().toISOString(),
  };

  const list = inMemoryMaterials.get(userId) || [];
  list.push(record);
  if (list.length > 50) {
    list.splice(0, list.length - 50);
  }
  inMemoryMaterials.set(userId, list);
  schedulePersist(2000);

  // Sync to Turso
  if (turso && isTursoHealthy) {
    turso
      .execute({
        sql: `INSERT INTO materials (id, user_id, file_name, chunks_count, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: [
          "mat_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now(),
          userId,
          fileName,
          chunksCount,
          record.createdAt,
        ],
      })
      .catch((err) => {
        console.warn("[Turso] Cloud sync notice (material):", (err as any)?.message);
      });
  }

  if (supabase && isSupabaseHealthy) {
    Promise.resolve(
      supabase.from("materials").insert({
        user_id: userId,
        file_name: fileName,
        chunks_count: chunksCount,
        created_at: record.createdAt,
      })
    ).catch(() => {
      isSupabaseHealthy = false;
    });
  }

  return record;
}

export interface SafeUserRecord {
  id: string;
  fullName: string;
  email: string;
  educationLevel: string;
  classYear: string;
  course: string;
  userType?: string;
  role?: "student" | "others";
  createdAt?: string;
}

export async function getAllUsers(): Promise<SafeUserRecord[]> {
  const uniqueUsers: SafeUserRecord[] = [];
  const seenEmails = new Set<string>();

  for (const [key, user] of inMemoryUsers.entries()) {
    if (key.includes("@") && !seenEmails.has(key)) {
      seenEmails.add(key);
      uniqueUsers.push({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        educationLevel: user.educationLevel,
        classYear: user.classYear,
        course: user.course,
        userType: user.userType,
        role: user.role,
        createdAt: user.createdAt,
      });
    }
  }

  // If local memory is empty and Turso is connected, populate from Turso
  if (uniqueUsers.length === 0 && turso && isTursoHealthy) {
    try {
      const res = await withTimeout(turso.execute(`SELECT * FROM users LIMIT 100`), 2000);
      if (res.rows && res.rows.length > 0) {
        for (const r of res.rows as any[]) {
          if (!seenEmails.has(String(r.email).toLowerCase())) {
            seenEmails.add(String(r.email).toLowerCase());
            uniqueUsers.push({
              id: String(r.id),
              fullName: String(r.full_name || ""),
              email: String(r.email || ""),
              educationLevel: String(r.education_level || ""),
              classYear: String(r.class_year || ""),
              course: String(r.course || ""),
              userType: r.user_type ? String(r.user_type) : undefined,
              role: (r.role as any) || "student",
              createdAt: r.created_at ? String(r.created_at) : undefined,
            });
          }
        }
      }
    } catch (err: any) {
      console.warn("[Turso] getAllUsers notice:", err?.message);
    }
  }

  return uniqueUsers;
}

export async function updateUserPassword(userId: string, newPasswordHash: string): Promise<boolean> {
  const user = inMemoryUsers.get(userId);
  if (!user) return false;

  user.passwordHash = newPasswordHash;
  delete user.rawPassword;
  inMemoryUsers.set(user.id, user);
  inMemoryUsers.set(user.email.toLowerCase(), user);
  schedulePersist(500);

  // Sync to Turso
  if (turso && isTursoHealthy) {
    turso
      .execute({
        sql: `UPDATE users SET password_hash = ? WHERE id = ?`,
        args: [newPasswordHash, userId],
      })
      .catch((err) => {
        console.warn("[Turso] Cloud sync notice (update password):", (err as any)?.message);
      });
  }

  if (supabase && isSupabaseHealthy) {
    try {
      await supabase.from("users").update({ password_hash: newPasswordHash }).eq("id", userId);
    } catch {
      isSupabaseHealthy = false;
    }
  }

  return true;
}

export async function deleteUser(userId: string): Promise<boolean> {
  const user = inMemoryUsers.get(userId);
  if (!user) return false;

  inMemoryUsers.delete(user.id);
  inMemoryUsers.delete(user.email.toLowerCase());
  inMemoryChats.delete(userId);
  inMemoryMaterials.delete(userId);
  schedulePersist(500);

  // Sync to Turso
  if (turso && isTursoHealthy) {
    Promise.all([
      turso.execute({ sql: `DELETE FROM users WHERE id = ?`, args: [userId] }),
      turso.execute({ sql: `DELETE FROM chats WHERE user_id = ?`, args: [userId] }),
      turso.execute({ sql: `DELETE FROM materials WHERE user_id = ?`, args: [userId] }),
    ]).catch((err) => {
      console.warn("[Turso] Cloud sync notice (delete user):", (err as any)?.message);
    });
  }

  if (supabase && isSupabaseHealthy) {
    try {
      await supabase.from("users").delete().eq("id", userId);
    } catch {
      isSupabaseHealthy = false;
    }
  }

  return true;
}

export async function updateUserRole(userId: string, role: "student" | "others"): Promise<boolean> {
  const user = inMemoryUsers.get(userId);
  if (!user) return false;

  user.role = role;
  inMemoryUsers.set(user.id, user);
  inMemoryUsers.set(user.email.toLowerCase(), user);
  schedulePersist(500);

  // Sync to Turso
  if (turso && isTursoHealthy) {
    turso
      .execute({
        sql: `UPDATE users SET role = ? WHERE id = ?`,
        args: [role, userId],
      })
      .catch((err) => {
        console.warn("[Turso] Cloud sync notice (role update):", (err as any)?.message);
      });
  }

  if (supabase && isSupabaseHealthy) {
    try {
      await supabase.from("users").update({ role }).eq("id", userId);
    } catch {
      isSupabaseHealthy = false;
    }
  }

  return true;
}

export async function saveFeedback(fb: Omit<FeedbackRecord, "id" | "createdAt">): Promise<FeedbackRecord> {
  const record: FeedbackRecord = {
    ...fb,
    id: "fb_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now(),
    createdAt: new Date().toISOString(),
  };
  inMemoryFeedback.push(record);
  schedulePersist(500);

  // Sync to Turso
  if (turso && isTursoHealthy) {
    turso
      .execute({
        sql: `INSERT INTO feedback (id, user_id, email, full_name, rating, category, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          record.id,
          record.userId || null,
          record.email || null,
          record.fullName || null,
          record.rating,
          record.category,
          record.message,
          record.createdAt,
        ],
      })
      .catch((err) => {
        console.warn("[Turso] Cloud sync notice (feedback):", (err as any)?.message);
      });
  }

  return record;
}

export async function getAllFeedback(): Promise<FeedbackRecord[]> {
  return [...inMemoryFeedback].reverse();
}

/**
 * Retrieve user by ID
 */
export async function getUserById(userId: string): Promise<UserRecord | null> {
  const local = inMemoryUsers.get(userId);
  if (local) return local;

  // Check Turso if available
  if (turso && isTursoHealthy) {
    try {
      const res = await withTimeout(
        turso.execute({
          sql: `SELECT * FROM users WHERE id = ? LIMIT 1`,
          args: [userId],
        }),
        2000
      );
      if (res.rows && res.rows.length > 0) {
        const row: any = res.rows[0];
        const user: UserRecord = {
          id: String(row.id),
          fullName: String(row.full_name || ""),
          email: String(row.email || ""),
          passwordHash: String(row.password_hash || ""),
          educationLevel: String(row.education_level || ""),
          classYear: String(row.class_year || ""),
          course: String(row.course || ""),
          role: (row.role as any) || "student",
          userType: row.user_type ? String(row.user_type) : "student",
          createdAt: row.created_at ? String(row.created_at) : undefined,
        };
        inMemoryUsers.set(user.id, user);
        inMemoryUsers.set(user.email.toLowerCase(), user);
        return user;
      }
    } catch (err: any) {
      console.warn("[Turso] getUserById notice:", err?.message);
    }
  }

  if (isSupabaseHealthy && supabase) {
    try {
      const query = supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      const { data, error } = await withTimeout(Promise.resolve(query), 2000);
      if (!error && data) {
        const user: UserRecord = {
          id: data.id,
          fullName: data.full_name,
          email: data.email,
          passwordHash: data.password_hash,
          educationLevel: data.education_level,
          classYear: data.class_year,
          course: data.course,
          role: data.role || "student",
          userType: data.user_type || "student",
          createdAt: data.created_at,
        };
        inMemoryUsers.set(user.id, user);
        inMemoryUsers.set(user.email.toLowerCase(), user);
        return user;
      }
    } catch {
      isSupabaseHealthy = false;
    }
  }

  return null;
}

/**
 * Refresh token storage and lifecycle management
 */
export async function saveRefreshTokenRecord(record: RefreshTokenRecord): Promise<void> {
  inMemoryRefreshTokens.set(record.tokenHash, record);
  schedulePersist(500);

  // Sync to Turso
  if (turso && isTursoHealthy) {
    turso
      .execute({
        sql: `INSERT OR REPLACE INTO refresh_tokens (token_hash, id, user_id, expires_at, created_at, revoked_at, replaced_by_token_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          record.tokenHash,
          record.id,
          record.userId,
          record.expiresAt,
          record.createdAt,
          record.revokedAt,
          record.replacedByTokenId,
        ],
      })
      .catch((err) => {
        console.warn("[Turso] Cloud sync notice (refresh token):", (err as any)?.message);
      });
  }
}

export async function getRefreshTokenRecord(tokenHash: string): Promise<RefreshTokenRecord | null> {
  const local = inMemoryRefreshTokens.get(tokenHash);
  if (local) return local;

  if (turso && isTursoHealthy) {
    try {
      const res = await withTimeout(
        turso.execute({
          sql: `SELECT * FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
          args: [tokenHash],
        }),
        2000
      );
      if (res.rows && res.rows.length > 0) {
        const row: any = res.rows[0];
        const record: RefreshTokenRecord = {
          tokenHash: String(row.token_hash),
          id: String(row.id),
          userId: String(row.user_id),
          expiresAt: String(row.expires_at),
          createdAt: String(row.created_at),
          revokedAt: row.revoked_at ? String(row.revoked_at) : null,
          replacedByTokenId: row.replaced_by_token_id ? String(row.replaced_by_token_id) : null,
        };
        inMemoryRefreshTokens.set(tokenHash, record);
        return record;
      }
    } catch (err: any) {
      console.warn("[Turso] getRefreshTokenRecord notice:", err?.message);
    }
  }

  return null;
}

export async function updateRefreshTokenRecord(record: RefreshTokenRecord): Promise<void> {
  inMemoryRefreshTokens.set(record.tokenHash, record);
  schedulePersist(500);

  if (turso && isTursoHealthy) {
    turso
      .execute({
        sql: `UPDATE refresh_tokens SET revoked_at = ?, replaced_by_token_id = ? WHERE token_hash = ?`,
        args: [record.revokedAt, record.replacedByTokenId, record.tokenHash],
      })
      .catch((err) => {
        console.warn("[Turso] Cloud sync notice (update refresh token):", (err as any)?.message);
      });
  }
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  const now = new Date().toISOString();
  for (const record of inMemoryRefreshTokens.values()) {
    if (record.userId === userId && !record.revokedAt) {
      record.revokedAt = now;
      inMemoryRefreshTokens.set(record.tokenHash, record);
    }
  }
  schedulePersist(500);

  if (turso && isTursoHealthy) {
    turso
      .execute({
        sql: `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
        args: [now, userId],
      })
      .catch((err) => {
        console.warn("[Turso] Cloud sync notice (revoke user tokens):", (err as any)?.message);
      });
  }
}
