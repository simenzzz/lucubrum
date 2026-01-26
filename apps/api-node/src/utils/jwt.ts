/**
 * JWT signing and verification utilities.
 */

import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger';

// JWT configuration from environment
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

/**
 * Access token payload structure.
 */
export interface AccessTokenPayload {
  sub: string; // user_id
  email: string;
  roles: string[];
  jti: string; // for blacklisting
  type: 'access';
  exp?: number;
  iat?: number;
}

/**
 * Refresh token payload structure.
 */
export interface RefreshTokenPayload {
  sub: string; // user_id
  jti: string;
  type: 'refresh';
  exp?: number;
  iat?: number;
}

/**
 * User data needed for token generation.
 */
export interface TokenUser {
  user_id: string;
  email: string;
  roles: string[];
}

/**
 * Result from creating a token pair.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshJti: string;
  refreshExpiresAt: Date;
}

/**
 * Parse an expiry string like '15m' or '7d' into milliseconds.
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiry format: ${expiry}`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}

/**
 * Parse an expiry string like '15m' or '7d' into seconds (for JWT expiresIn).
 */
function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 900; // Default 15 minutes
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 24 * 60 * 60;
    default:
      return 900;
  }
}

/**
 * Sign an access token for a user.
 */
export function signAccessToken(user: TokenUser): string {
  const jti = uuidv4();
  const payload: Omit<AccessTokenPayload, 'exp' | 'iat'> = {
    sub: user.user_id,
    email: user.email,
    roles: user.roles,
    jti,
    type: 'access',
  };

  const expirySeconds = parseExpiryToSeconds(JWT_ACCESS_EXPIRY);
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: expirySeconds,
  });
}

/**
 * Sign a refresh token for a user.
 * Returns the token, its JTI (for storage), and expiration date.
 */
export function signRefreshToken(userId: string): {
  token: string;
  jti: string;
  expiresAt: Date;
} {
  const jti = uuidv4();
  const payload: Omit<RefreshTokenPayload, 'exp' | 'iat'> = {
    sub: userId,
    jti,
    type: 'refresh',
  };

  const expirySeconds = parseExpiryToSeconds(JWT_REFRESH_EXPIRY);
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: expirySeconds,
  });

  const expiresAt = new Date(Date.now() + parseExpiry(JWT_REFRESH_EXPIRY));

  return { token, jti, expiresAt };
}

/**
 * Verify an access token.
 * Returns the payload if valid, null otherwise.
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
    if (payload.type !== 'access') {
      logger.warn({ type: payload.type }, 'Invalid token type for access token');
      return null;
    }
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Access token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn({ error }, 'Invalid access token');
    }
    return null;
  }
}

/**
 * Verify a refresh token.
 * Returns the payload if valid, null otherwise.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as RefreshTokenPayload;
    if (payload.type !== 'refresh') {
      logger.warn({ type: payload.type }, 'Invalid token type for refresh token');
      return null;
    }
    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Refresh token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn({ error }, 'Invalid refresh token');
    }
    return null;
  }
}

/**
 * Create both access and refresh tokens for a user.
 */
export function createTokenPair(user: TokenUser): TokenPair {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, jti: refreshJti, expiresAt: refreshExpiresAt } =
    signRefreshToken(user.user_id);

  const accessExpiresAt = new Date(Date.now() + parseExpiry(JWT_ACCESS_EXPIRY));

  return {
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshJti,
    refreshExpiresAt,
  };
}

/**
 * Decode a token without verifying (for extracting expiry for blacklisting).
 */
export function decodeToken(token: string): { exp?: number; jti?: string } | null {
  try {
    return jwt.decode(token) as { exp?: number; jti?: string } | null;
  } catch {
    return null;
  }
}
