/**
 * Authentication middleware for JWT verification.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { redis } from '../db/redis';
import logger from '../utils/logger';
import { getAccessTokenFromCookies } from '../utils/cookies';

/**
 * Extend Express Request to include user info.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        user_id: string;
        email: string;
        roles: string[];
        jti: string;
        exp: number;
      };
    }
  }
}

/**
 * Error response structure for auth errors.
 */
interface AuthErrorResponse {
  error: string;
  message: string;
  request_id: string;
}

/**
 * Extract access token from request cookies.
 * Authentication is cookie-only - no Authorization header support.
 */
function extractToken(req: Request): string | null {
  return getAccessTokenFromCookies(req.cookies || {}) || null;
}

/**
 * Get request ID from headers or generate a placeholder.
 */
function getRequestId(req: Request): string {
  return (req.headers['x-request-id'] as string) || 'unknown';
}

/**
 * Require authentication middleware.
 * Returns 401 if token is missing, invalid, or blacklisted.
 */
export async function requireAuth(
  req: Request,
  res: Response<AuthErrorResponse>,
  next: NextFunction
): Promise<void> {
  const requestId = getRequestId(req);

  // Extract token from cookies
  const token = extractToken(req);
  if (!token) {
    logger.debug({ requestId, path: req.path }, 'Missing access token cookie');
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing access token',
      request_id: requestId,
    });
    return;
  }

  // Verify JWT signature and expiry
  const payload = verifyAccessToken(token);
  if (!payload) {
    logger.debug({ requestId, path: req.path }, 'Invalid access token');
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired access token',
      request_id: requestId,
    });
    return;
  }

  // Check Redis blacklist (fail-open - if Redis is down, allow the request)
  let isBlacklisted = false;
  try {
    isBlacklisted = await redis.isTokenBlacklisted(payload.jti);
  } catch (e) {
    logger.warn({ error: e, jti: payload.jti }, 'Redis unavailable, skipping blacklist check');
  }
  if (isBlacklisted) {
    logger.warn({ requestId, jti: payload.jti }, 'Token is blacklisted');
    res.status(401).json({
      error: 'TOKEN_REVOKED',
      message: 'Token has been revoked',
      request_id: requestId,
    });
    return;
  }

  // Attach user info to request
  req.user = {
    user_id: payload.sub,
    email: payload.email,
    roles: payload.roles,
    jti: payload.jti,
    exp: payload.exp!,
  };

  next();
}

/**
 * Require specific role middleware.
 * Must be used after requireAuth.
 * Returns 403 if user lacks the required role.
 */
export function requireRole(role: string) {
  return (
    req: Request,
    res: Response<AuthErrorResponse>,
    next: NextFunction
  ): void => {
    const requestId = getRequestId(req);

    if (!req.user) {
      // This should not happen if requireAuth is used first
      logger.error({ requestId, path: req.path }, 'requireRole used without requireAuth');
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Authentication middleware misconfigured',
        request_id: requestId,
      });
      return;
    }

    if (!req.user.roles.includes(role)) {
      logger.debug(
        { requestId, userId: req.user.user_id, requiredRole: role, userRoles: req.user.roles },
        'User lacks required role'
      );
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Required role: ${role}`,
        request_id: requestId,
      });
      return;
    }

    next();
  };
}

/**
 * Optional authentication middleware.
 * Attaches user info if token is present and valid, but allows request to continue if not.
 * Useful for routes that have different behavior for authenticated vs anonymous users.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const requestId = getRequestId(req);

  // Extract token from cookies
  const token = extractToken(req);
  if (!token) {
    // No token - continue without user
    next();
    return;
  }

  // Verify JWT signature and expiry
  const payload = verifyAccessToken(token);
  if (!payload) {
    // Invalid token - continue without user (don't fail)
    logger.debug({ requestId, path: req.path }, 'Invalid optional auth token, continuing without user');
    next();
    return;
  }

  // Check Redis blacklist (fail-open)
  const isBlacklisted = await redis.isTokenBlacklisted(payload.jti);
  if (isBlacklisted) {
    // Blacklisted token - continue without user
    logger.debug({ requestId, jti: payload.jti }, 'Optional auth token is blacklisted, continuing without user');
    next();
    return;
  }

  // Attach user info to request
  req.user = {
    user_id: payload.sub,
    email: payload.email,
    roles: payload.roles,
    jti: payload.jti,
    exp: payload.exp!,
  };

  next();
}
