/**
 * Cookie utilities for HTTP-only cookie-based authentication.
 */

import { Response } from 'express';
import logger from './logger';
import { parseDurationMs } from './duration';

// Cookie names
const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Get cookie configuration from environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || NODE_ENV === 'production';

// Token expiry times from env (matching JWT settings)
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// Parse and validate expiry times at startup - will throw if invalid
const ACCESS_MAX_AGE = parseDurationMs(ACCESS_EXPIRY, 'JWT_ACCESS_EXPIRY');
const REFRESH_MAX_AGE = parseDurationMs(REFRESH_EXPIRY, 'JWT_REFRESH_EXPIRY');

// Log parsed expiry values at startup for debugging
logger.info(
  {
    accessExpiry: ACCESS_EXPIRY,
    accessMaxAgeMs: ACCESS_MAX_AGE,
    refreshExpiry: REFRESH_EXPIRY,
    refreshMaxAgeMs: REFRESH_MAX_AGE,
  },
  'Cookie expiry configuration loaded'
);

/**
 * Set auth cookies on response
 * @param res - Express response object
 * @param accessToken - JWT access token
 * @param refreshToken - Optional JWT refresh token (only set on initial login)
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken?: string
): void {
  // Set access token cookie
  // Using 'lax' for SameSite to allow cookies on OAuth redirects (top-level navigations)
  // while still protecting against CSRF on cross-site POST requests
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: ACCESS_MAX_AGE,
    path: '/',
    ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
  });

  // Set refresh token cookie only if provided
  if (refreshToken) {
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'lax',
      maxAge: REFRESH_MAX_AGE,
      path: '/auth', // Restrict refresh token to auth endpoints
      ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
    });
  }
}

/**
 * Clear auth cookies from response
 * @param res - Express response object
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
  });

  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/auth',
    ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
  });
}

/**
 * Get access token from cookies.
 * Validates that the value is a string to protect against array injection attacks
 * (e.g., Cookie: access_token[]=malicious).
 * @param cookies - Request cookies object
 */
export function getAccessTokenFromCookies(
  cookies: Record<string, unknown>
): string | undefined {
  const token = cookies[ACCESS_TOKEN_COOKIE];
  return typeof token === 'string' ? token : undefined;
}

/**
 * Get refresh token from cookies.
 * Validates that the value is a string to protect against array injection attacks.
 * @param cookies - Request cookies object
 */
export function getRefreshTokenFromCookies(
  cookies: Record<string, unknown>
): string | undefined {
  const token = cookies[REFRESH_TOKEN_COOKIE];
  return typeof token === 'string' ? token : undefined;
}

// Note: Cookie maxAge and JWT exp are computed independently. This is intentional -
// the cookie acts as transport, and the JWT exp claim is the source of truth for expiry.
// The auth middleware validates JWT exp on every request, so cookie maxAge is defense-in-depth.
// Small clock drift between cookie expiry and JWT expiry is acceptable.
