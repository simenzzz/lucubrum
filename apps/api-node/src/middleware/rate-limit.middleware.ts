/**
 * Rate limiting middleware using Redis for distributed rate limiting.
 *
 * Implements sliding window rate limiting with per-user and per-IP limits.
 * Fails open on Redis errors (logs warning, allows request).
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../db/redis';
import logger from '../utils/logger';

/**
 * Rate limit configuration.
 */
interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Key prefix for Redis */
  keyPrefix: string;
  /** Optional custom key generator */
  keyGenerator?: (req: Request) => string | null;
}

/**
 * Rate limit result.
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

/**
 * Predefined rate limit configurations based on API.md spec.
 */
export const RateLimits = {
  /** Per-user: 100 requests / hour (general) */
  GENERAL: {
    limit: 100,
    windowSeconds: 3600,
    keyPrefix: 'ratelimit:user:general',
  },
  /** Plan creation: 10 requests / hour */
  PLAN_CREATION: {
    limit: 10,
    windowSeconds: 3600,
    keyPrefix: 'ratelimit:user:plan',
  },
  /** Exercise generation: 50 requests / hour */
  EXERCISE_GENERATION: {
    limit: 50,
    windowSeconds: 3600,
    keyPrefix: 'ratelimit:user:exercise',
  },
  /** Grading: 200 requests / hour */
  GRADING: {
    limit: 200,
    windowSeconds: 3600,
    keyPrefix: 'ratelimit:user:grading',
  },
  /** Per-IP: 20 requests / minute (auth endpoints) */
  AUTH_IP: {
    limit: 20,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:ip:auth',
  },
  /** Per-IP: 60 requests / minute (health endpoint) */
  HEALTH_IP: {
    limit: 60,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:ip:health',
  },
} as const;

/**
 * Get the client IP address from the request.
 * Handles X-Forwarded-For header for proxied requests.
 */
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    // Take the first IP in the chain (original client)
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || 'unknown';
}

/**
 * Get request ID from headers.
 */
function getRequestId(req: Request): string {
  return (req.headers['x-request-id'] as string) || 'unknown';
}

/**
 * Check rate limit using Redis sliding window.
 * Returns limit result with remaining count and reset time.
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const windowStart = now - windowMs;
  const fullKey = `${config.keyPrefix}:${key}`;

  try {
    // Use Redis sorted set for sliding window
    const client = redis.getClient();
    if (!client || !redis.isReady()) {
      // No client available or not ready - fail open
      return {
        allowed: true,
        remaining: config.limit,
        resetAt: new Date(now + windowMs),
        limit: config.limit,
      };
    }

    // Use Redis transaction for atomic operations
    const pipeline = client.pipeline();

    // Remove entries outside the window
    pipeline.zremrangebyscore(fullKey, 0, windowStart);

    // Count current entries
    pipeline.zcard(fullKey);

    // Add current request with timestamp as score
    pipeline.zadd(fullKey, now, `${now}:${Math.random()}`);

    // Set expiry on the key
    pipeline.expire(fullKey, config.windowSeconds);

    const results = await pipeline.exec();

    if (!results) {
      // Redis error - fail open
      return {
        allowed: true,
        remaining: config.limit,
        resetAt: new Date(now + windowMs),
        limit: config.limit,
      };
    }

    // Get count from zcard result (index 1 in results)
    const count = (results[1]?.[1] as number) || 0;
    const remaining = Math.max(0, config.limit - count - 1);
    const allowed = count < config.limit;

    return {
      allowed,
      remaining,
      resetAt: new Date(now + windowMs),
      limit: config.limit,
    };
  } catch (error) {
    // Fail open on Redis errors
    logger.warn({ error, key: fullKey }, 'Rate limit check failed, failing open');
    return {
      allowed: true,
      remaining: config.limit,
      resetAt: new Date(now + windowMs),
      limit: config.limit,
    };
  }
}

/**
 * Create rate limiting middleware for user-based limits.
 * Requires authentication - uses req.user.user_id as the key.
 */
export function rateLimitByUser(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = getRequestId(req);

    // Get user ID from authenticated request
    const userId = req.user?.user_id;
    if (!userId) {
      // Not authenticated - skip rate limiting (auth middleware will handle)
      next();
      return;
    }

    const key = config.keyGenerator ? config.keyGenerator(req) : userId;
    if (!key) {
      next();
      return;
    }

    const result = await checkRateLimit(key, config);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfter);

      logger.warn(
        { requestId, userId, key, limit: result.limit },
        'Rate limit exceeded'
      );

      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        details: {
          limit: result.limit,
          window_seconds: config.windowSeconds,
          retry_after: retryAfter,
        },
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/**
 * Create rate limiting middleware for IP-based limits.
 * Does not require authentication - uses client IP as the key.
 */
export function rateLimitByIP(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = getRequestId(req);
    const clientIP = getClientIP(req);

    const result = await checkRateLimit(clientIP, config);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfter);

      logger.warn(
        { requestId, clientIP, limit: result.limit },
        'IP rate limit exceeded'
      );

      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        details: {
          limit: result.limit,
          window_seconds: config.windowSeconds,
          retry_after: retryAfter,
        },
        request_id: requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/**
 * Combined rate limiting middleware that applies both user and IP limits.
 * Useful for authenticated endpoints that need both protection layers.
 */
export function rateLimitCombined(userConfig: RateLimitConfig, ipConfig: RateLimitConfig) {
  const userLimiter = rateLimitByUser(userConfig);
  const ipLimiter = rateLimitByIP(ipConfig);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Apply IP limit first
    await new Promise<void>((resolve) => {
      ipLimiter(req, res, () => resolve());
    });

    // If IP limit returned a response, don't continue
    if (res.headersSent) {
      return;
    }

    // Apply user limit
    userLimiter(req, res, next);
  };
}

/**
 * Convenience middleware creators for common rate limit configurations.
 */
export const rateLimit = {
  /** General API rate limit (100/hour per user) */
  general: () => rateLimitByUser(RateLimits.GENERAL),

  /** Plan creation rate limit (10/hour per user) */
  planCreation: () => rateLimitByUser(RateLimits.PLAN_CREATION),

  /** Exercise generation rate limit (50/hour per user) */
  exerciseGeneration: () => rateLimitByUser(RateLimits.EXERCISE_GENERATION),

  /** Grading rate limit (200/hour per user) */
  grading: () => rateLimitByUser(RateLimits.GRADING),

  /** Auth endpoints IP rate limit (20/minute per IP) */
  authIP: () => rateLimitByIP(RateLimits.AUTH_IP),

  /** Health endpoint IP rate limit (60/minute per IP) */
  healthIP: () => rateLimitByIP(RateLimits.HEALTH_IP),
};
