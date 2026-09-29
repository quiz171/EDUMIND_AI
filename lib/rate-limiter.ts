interface RateLimitData {
  count: number;
  lastReset: string; // YYYY-MM-DD
}

interface BurstLimitData {
  count: number;
  resetAt: number;
}

const limits = new Map<string, RateLimitData>();
const burstLimits = new Map<string, BurstLimitData>();

interface AuthRateData {
  failures: number;
  blockedUntil: number;
  windowStart: number;
}
const authFailures = new Map<string, AuthRateData>();

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

// Clean up stale rate limits every 15 minutes to prevent memory leaks with 10,000+ concurrent users
setInterval(() => {
  const today = getTodayString();
  for (const [key, val] of limits.entries()) {
    if (val.lastReset !== today) {
      limits.delete(key);
    }
  }

  const now = Date.now();
  for (const [key, val] of burstLimits.entries()) {
    if (val.resetAt < now) {
      burstLimits.delete(key);
    }
  }

  // Safety ceiling: If map size grows beyond 50,000 keys, prune oldest entries
  if (limits.size > 50000) {
    let count = 0;
    for (const key of limits.keys()) {
      limits.delete(key);
      count++;
      if (count >= 10000) break;
    }
  }

  if (burstLimits.size > 50000) {
    let count = 0;
    for (const key of burstLimits.keys()) {
      burstLimits.delete(key);
      count++;
      if (count >= 10000) break;
    }
  }
}, 900000); // 15 minutes

/**
 * Sliding window burst limiter: prevents runaway scripts or DoS from starving concurrent users.
 * Optimized for high-concurrency environments (e.g. shared university WiFi, cellular gateways, and 10,000+ users).
 */
export function checkBurstLimit(identifier: string, maxPerMinute: number = 120): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  let burst = burstLimits.get(identifier);

  if (!burst || burst.resetAt < now) {
    burst = { count: 1, resetAt: now + 60000 };
    burstLimits.set(identifier, burst);
    return { allowed: true, retryAfter: 0 };
  }

  if (burst.count >= maxPerMinute) {
    return { allowed: false, retryAfter: Math.ceil((burst.resetAt - now) / 1000) };
  }

  burst.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function checkLimit(userId: string, isPremium: boolean = false): { allowed: boolean; remaining: number } {
  const maxLimit = isPremium ? 500 : 500; // Generous 500 queries/day
  const today = getTodayString();

  let userLimit = limits.get(userId);

  if (!userLimit || userLimit.lastReset !== today) {
    userLimit = { count: 0, lastReset: today };
    limits.set(userId, userLimit);
  }

  if (userLimit.count >= maxLimit) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  userLimit.count += 1;
  limits.set(userId, userLimit);

  return {
    allowed: true,
    remaining: Math.max(0, maxLimit - userLimit.count),
  };
}

export function getRemainingLimit(userId: string, isPremium: boolean = false): number {
  const maxLimit = isPremium ? 500 : 500;
  const today = getTodayString();
  const userLimit = limits.get(userId);

  if (!userLimit || userLimit.lastReset !== today) {
    return maxLimit;
  }

  return Math.max(0, maxLimit - userLimit.count);
}

/**
 * Authentication failure rate limiter to prevent credential stuffing & brute-force attacks.
 * Blocks IP / account after 10 failed attempts within a 15-minute window.
 */
export function checkAuthLimit(
  identifier: string,
  maxFailures: number = 10,
  windowMs: number = 15 * 60 * 1000
): { allowed: boolean; retryAfter: number; remainingAttempts: number } {
  const now = Date.now();
  const data = authFailures.get(identifier);

  if (!data) {
    return { allowed: true, retryAfter: 0, remainingAttempts: maxFailures };
  }

  // If currently blocked
  if (data.blockedUntil > now) {
    return {
      allowed: false,
      retryAfter: Math.ceil((data.blockedUntil - now) / 1000),
      remainingAttempts: 0,
    };
  }

  // If window expired, reset
  if (now - data.windowStart > windowMs) {
    authFailures.delete(identifier);
    return { allowed: true, retryAfter: 0, remainingAttempts: maxFailures };
  }

  if (data.failures >= maxFailures) {
    // Apply 15-minute block
    data.blockedUntil = now + windowMs;
    return {
      allowed: false,
      retryAfter: Math.ceil(windowMs / 1000),
      remainingAttempts: 0,
    };
  }

  return {
    allowed: true,
    retryAfter: 0,
    remainingAttempts: Math.max(0, maxFailures - data.failures),
  };
}

export function recordAuthFailure(identifier: string, windowMs: number = 15 * 60 * 1000): void {
  const now = Date.now();
  let data = authFailures.get(identifier);

  if (!data || now - data.windowStart > windowMs) {
    data = { failures: 1, blockedUntil: 0, windowStart: now };
  } else {
    data.failures += 1;
    if (data.failures >= 10) {
      data.blockedUntil = now + windowMs;
    }
  }

  authFailures.set(identifier, data);
}

export function resetAuthFailures(identifier: string): void {
  authFailures.delete(identifier);
}

