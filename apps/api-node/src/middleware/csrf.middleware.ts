/**
 * CSRF protection middleware via Origin/Referer header validation.
 *
 * With cookie-based authentication, state-changing requests (POST/PUT/DELETE/PATCH)
 * are vulnerable to CSRF attacks. An attacker can craft a form on their site that
 * submits to our API, and the browser will automatically include cookies.
 *
 * This middleware validates that the Origin (or Referer) header matches our
 * configured CORS_ORIGIN, blocking cross-site form submissions.
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Methods that don't change state - skip CSRF check
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Parse origin from a URL string.
 * Returns null if parsing fails.
 */
function parseOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Get the allowed origin from CORS_ORIGIN config.
 */
function getAllowedOrigin(): string | null {
  return parseOrigin(CORS_ORIGIN);
}

/**
 * CSRF protection middleware.
 *
 * For state-changing requests (POST, PUT, DELETE, PATCH):
 * 1. Validates Origin header matches CORS_ORIGIN
 * 2. Falls back to Referer header if Origin is missing
 * 3. Rejects requests with no valid origin
 *
 * Safe methods (GET, HEAD, OPTIONS) are skipped.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip CSRF check for safe methods
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const allowedOrigin = getAllowedOrigin();
  if (!allowedOrigin) {
    // This should have been caught at startup validation, but handle defensively
    logger.error({ corsOrigin: CORS_ORIGIN }, 'Invalid CORS_ORIGIN configuration');
    res.status(500).json({
      error: 'SERVER_MISCONFIGURED',
      message: 'Server CORS configuration is invalid',
      request_id: (req.headers['x-request-id'] as string) || 'unknown',
    });
    return;
  }

  // Check Origin header first (most reliable)
  const originHeader = req.headers.origin;
  if (originHeader) {
    const requestOrigin = parseOrigin(originHeader);
    if (requestOrigin === allowedOrigin) {
      next();
      return;
    }

    // Origin header present but doesn't match
    logger.warn(
      {
        method: req.method,
        path: req.path,
        origin: originHeader,
        allowedOrigin,
      },
      'CSRF check failed: Origin mismatch'
    );
    res.status(403).json({
      error: 'CSRF_VALIDATION_FAILED',
      message: 'Request origin is not allowed',
      request_id: (req.headers['x-request-id'] as string) || 'unknown',
    });
    return;
  }

  // Fall back to Referer header (some browsers don't send Origin on same-origin requests)
  const refererHeader = req.headers.referer;
  if (refererHeader) {
    const refererOrigin = parseOrigin(refererHeader);
    if (refererOrigin === allowedOrigin) {
      next();
      return;
    }

    // Referer header present but doesn't match
    logger.warn(
      {
        method: req.method,
        path: req.path,
        referer: refererHeader,
        allowedOrigin,
      },
      'CSRF check failed: Referer origin mismatch'
    );
    res.status(403).json({
      error: 'CSRF_VALIDATION_FAILED',
      message: 'Request origin is not allowed',
      request_id: (req.headers['x-request-id'] as string) || 'unknown',
    });
    return;
  }

  // No Origin or Referer header - reject the request
  // This can happen with:
  // - Direct API calls without browser (should use proper API clients)
  // - Privacy extensions stripping headers
  // - Old browsers
  logger.warn(
    {
      method: req.method,
      path: req.path,
    },
    'CSRF check failed: No Origin or Referer header'
  );
  res.status(403).json({
    error: 'CSRF_VALIDATION_FAILED',
    message: 'Origin or Referer header is required for state-changing requests',
    request_id: (req.headers['x-request-id'] as string) || 'unknown',
  });
}
