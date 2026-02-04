/**
 * Authentication service for Google OAuth 2.0 with PKCE flow.
 */

import crypto from 'crypto';
import { OAuth2Client, TokenPayload, CodeChallengeMethod } from 'google-auth-library';
import logger from '../utils/logger';
import { redis } from '../db/redis';
import { createTokenPair, verifyRefreshToken, signAccessToken } from '../utils/jwt';
import { upsertUser, getUserById, UserRow } from '../db/queries/users';
import {
  createRefreshToken,
  getRefreshTokenByHash,
  hashToken,
  revokeRefreshToken,
} from '../db/queries/tokens';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/callback';

// Google OAuth scopes
const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

/**
 * Result from OAuth callback handling.
 */
export interface AuthResult {
  user: UserRow;
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
  };
}

/**
 * OAuth initiation result.
 */
export interface OAuthInitiation {
  authorization_url: string;
  state: string;
}

/**
 * Error codes for auth operations.
 */
export type AuthErrorCode =
  | 'INVALID_STATE'
  | 'OAUTH_EXCHANGE_FAILED'
  | 'EMAIL_NOT_VERIFIED'
  | 'INVALID_REFRESH_TOKEN'
  | 'TOKEN_REVOKED';

/**
 * Auth service error with structured code.
 */
export interface AuthServiceError extends Error {
  code: AuthErrorCode;
  statusCode: number;
}

function createAuthError(
  message: string,
  code: AuthErrorCode,
  statusCode: number
): AuthServiceError {
  const error = new Error(message) as AuthServiceError;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * Generate a cryptographically secure random string.
 */
function generateSecureString(length: number): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Generate PKCE code verifier (43-128 characters).
 */
function generateCodeVerifier(): string {
  return generateSecureString(64);
}

/**
 * Generate PKCE code challenge from verifier using SHA-256.
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

class AuthService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Initiate Google OAuth flow.
   * Generates PKCE code verifier/challenge and stores verifier in Redis.
   */
  async initiateGoogleOAuth(): Promise<OAuthInitiation> {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateSecureString(32);

    // Store code verifier in Redis with state as key
    await redis.storePKCEState(state, codeVerifier, 600); // 10 minute TTL

    // Generate authorization URL
    const authorizationUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GOOGLE_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: 'consent', // Force consent to get refresh token
    });

    logger.info({ state: state.substring(0, 8) + '...' }, 'OAuth flow initiated');

    return {
      authorization_url: authorizationUrl,
      state,
    };
  }

  /**
   * Handle Google OAuth callback.
   * Exchanges authorization code for tokens, fetches user info, creates user and tokens.
   */
  async handleGoogleCallback(
    code: string,
    state: string,
    requestId: string
  ): Promise<AuthResult> {
    // Retrieve and consume PKCE verifier from Redis
    const codeVerifier = await redis.consumePKCEState(state);
    if (!codeVerifier) {
      logger.warn({ requestId, state: state.substring(0, 8) + '...' }, 'Invalid or expired PKCE state');
      throw createAuthError('Invalid or expired state parameter', 'INVALID_STATE', 400);
    }

    // Exchange authorization code for tokens
    let tokens;
    try {
      const tokenResponse = await this.oauth2Client.getToken({
        code,
        codeVerifier,
      });
      tokens = tokenResponse.tokens;
    } catch (error) {
      logger.error({ error, requestId }, 'Google token exchange failed');
      throw createAuthError('Failed to exchange authorization code', 'OAUTH_EXCHANGE_FAILED', 401);
    }

    if (!tokens.id_token) {
      logger.error({ requestId }, 'No ID token received from Google');
      throw createAuthError('No ID token received', 'OAUTH_EXCHANGE_FAILED', 401);
    }

    // Verify ID token and extract user info
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (error) {
      logger.error({ error, requestId }, 'ID token verification failed');
      throw createAuthError('Invalid ID token', 'OAUTH_EXCHANGE_FAILED', 401);
    }

    if (!payload) {
      throw createAuthError('No payload in ID token', 'OAUTH_EXCHANGE_FAILED', 401);
    }

    // Check email verification
    if (!payload.email_verified) {
      logger.warn({ email: payload.email, requestId }, 'Email not verified');
      throw createAuthError('Google account email is not verified', 'EMAIL_NOT_VERIFIED', 403);
    }

    if (!payload.sub || !payload.email) {
      throw createAuthError('Missing required user info', 'OAUTH_EXCHANGE_FAILED', 401);
    }

    // Upsert user in database
    const user = await upsertUser({
      user_id: payload.sub,
      email: payload.email,
      name: payload.name || null,
      picture_url: payload.picture || null,
    });

    // Create token pair
    const tokenPair = createTokenPair({
      user_id: user.user_id,
      email: user.email,
      roles: user.roles,
    });

    // Store refresh token hash in database
    await createRefreshToken({
      user_id: user.user_id,
      token_hash: hashToken(tokenPair.refreshToken),
      expires_at: tokenPair.refreshExpiresAt,
    });

    logger.info({ userId: user.user_id, email: user.email, requestId }, 'User authenticated');

    return {
      user,
      tokens: {
        access_token: tokenPair.accessToken,
        refresh_token: tokenPair.refreshToken,
        expires_at: tokenPair.accessExpiresAt.toISOString(),
      },
    };
  }

  /**
   * Refresh an access token using a valid refresh token.
   */
  async refreshAccessToken(
    refreshToken: string,
    requestId: string
  ): Promise<{ access_token: string; expires_at: string }> {
    // Verify refresh token JWT
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      logger.warn({ requestId }, 'Invalid refresh token JWT');
      throw createAuthError('Invalid refresh token', 'INVALID_REFRESH_TOKEN', 401);
    }

    // Check token hash exists and is not revoked
    const tokenHash = hashToken(refreshToken);
    const storedToken = await getRefreshTokenByHash(tokenHash);

    if (!storedToken) {
      logger.warn({ requestId, jti: payload.jti }, 'Refresh token not found in database');
      throw createAuthError('Invalid refresh token', 'INVALID_REFRESH_TOKEN', 401);
    }

    if (storedToken.revoked_at) {
      logger.warn({ requestId, jti: payload.jti }, 'Refresh token has been revoked');
      throw createAuthError('Refresh token has been revoked', 'TOKEN_REVOKED', 401);
    }

    if (storedToken.expires_at < new Date()) {
      logger.warn({ requestId, jti: payload.jti }, 'Refresh token has expired');
      throw createAuthError('Refresh token has expired', 'INVALID_REFRESH_TOKEN', 401);
    }

    // Get user info for new access token
    const user = await getUserById(payload.sub);
    if (!user) {
      logger.error({ requestId, userId: payload.sub }, 'User not found for refresh token');
      throw createAuthError('User not found', 'INVALID_REFRESH_TOKEN', 401);
    }

    // Create new access token
    const accessToken = signAccessToken({
      user_id: user.user_id,
      email: user.email,
      roles: user.roles,
    });

    // Calculate expiry
    const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
    const expiryMs = parseExpiryToMs(JWT_ACCESS_EXPIRY);
    const expiresAt = new Date(Date.now() + expiryMs);

    logger.info({ userId: user.user_id, requestId }, 'Access token refreshed');

    return {
      access_token: accessToken,
      expires_at: expiresAt.toISOString(),
    };
  }

  /**
   * Logout - revoke refresh token and blacklist access token.
   */
  async logout(
    refreshToken: string,
    accessJti: string,
    accessExp: number,
    requestId: string
  ): Promise<void> {
    // Verify and hash refresh token
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      logger.warn({ requestId }, 'Invalid refresh token for logout');
      throw createAuthError('Invalid refresh token', 'INVALID_REFRESH_TOKEN', 401);
    }

    const tokenHash = hashToken(refreshToken);
    const storedToken = await getRefreshTokenByHash(tokenHash);

    if (storedToken && !storedToken.revoked_at) {
      // Revoke refresh token in Postgres
      await revokeRefreshToken(storedToken.token_id);
    }

    // Blacklist access token in Redis (TTL = remaining lifetime)
    const expiresAt = new Date(accessExp * 1000);
    await redis.blacklistToken(accessJti, expiresAt);

    logger.info({ userId: payload.sub, requestId }, 'User logged out');
  }

  /**
   * Blacklist an access token only (when refresh token is not available).
   * This ensures the access token can't be used even if refresh token cookie is missing.
   */
  async blacklistAccessToken(
    accessJti: string,
    accessExp: number,
    requestId: string
  ): Promise<void> {
    const expiresAt = new Date(accessExp * 1000);
    await redis.blacklistToken(accessJti, expiresAt);
    logger.info({ jti: accessJti, requestId }, 'Access token blacklisted');
  }
}

/**
 * Parse expiry string like '15m' or '7d' to milliseconds.
 */
function parseExpiryToMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 15 * 60 * 1000; // Default 15 minutes
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
      return 15 * 60 * 1000;
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;
