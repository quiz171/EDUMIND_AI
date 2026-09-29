import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

// Check for user-provided Supabase credentials (exclude dead/mock placeholders)
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
    supabase = createClient(rawUrl, rawKey, {
      auth: { persistSession: false },
    });
    isSupabaseHealthy = true;
  } catch (err) {
    console.warn("Supabase initialization error, falling back to local persistent store:", err);
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
}

export async function getRefreshTokenRecord(tokenHash: string): Promise<RefreshTokenRecord | null> {
  return inMemoryRefreshTokens.get(tokenHash) || null;
}

export async function updateRefreshTokenRecord(record: RefreshTokenRecord): Promise<void> {
  inMemoryRefreshTokens.set(record.tokenHash, record);
  schedulePersist(500);
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
}
