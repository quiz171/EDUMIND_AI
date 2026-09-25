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

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

// Clean up stale rate limits every hour to prevent memory leaks with 2000+ users
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
}, 3600000);

/**
 * Sliding window burst limiter: prevents runaway scripts or DoS from starving concurrent users.
 * Max 60 requests per minute per IP / user.
 */
export function checkBurstLimit(identifier: string, maxPerMinute: number = 60): { allowed: boolean; retryAfter: number } {
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
  const maxLimit = isPremium ? 200 : 200; // 200 in dev as requested (50 standard / 200 premium)
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
  const maxLimit = isPremium ? 200 : 200;
  const today = getTodayString();
  const userLimit = limits.get(userId);

  if (!userLimit || userLimit.lastReset !== today) {
    return maxLimit;
  }

  return Math.max(0, maxLimit - userLimit.count);
}
