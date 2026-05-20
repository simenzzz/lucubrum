/**
 * Authentication service for Google OAuth 2.0 with PKCE flow.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client, TokenPayload, CodeChallengeMethod } from 'google-auth-library';
import logger from '../utils/logger';
import { redis } from '../db/redis';
import { createTokenPair, verifyRefreshToken, signAccessToken } from '../utils/jwt';
import { parseDurationMs } from '../utils/duration';
import {
  upsertUser,
  getUserById,
  getUserByEmail,
  getUserByEmailWithHash,
  createEmailUser,
  updateLastLogin,
  UserRow,
} from '../db/queries/users';
import {
  createAuthProvider,
  findUserByProvider,
  getProvidersByUserId,
} from '../db/queries/auth-providers';
import { hashPassword, verifyPassword } from '../utils/password';
import { rateLimit } from '../middleware/rate-limit.middleware';
import {
  createRefreshToken,
  getRefreshTokenByHash,
  hashToken,
  revokeRefreshToken,
} from '../db/queries/tokens';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

// Facebook OAuth configuration (optional — all three must be set to enable)
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || '';
const FACEBOOK_API_VERSION = 'v19.0';

export function isFacebookConfigured(): boolean {
  return Boolean(FACEBOOK_APP_ID && FACEBOOK_APP_SECRET && FACEBOOK_REDIRECT_URI);
}

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
  | 'OAUTH_INIT_FAILED'
  | 'EMAIL_NOT_VERIFIED'
  | 'INVALID_REFRESH_TOKEN'
  | 'TOKEN_REVOKED'
  | 'REGISTRATION_FAILED'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED';

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

    // Check for cross-provider collision: same email already registered under a different provider
    const existingUser = await getUserByEmail(payload.email);
    if (existingUser) {
      const existingProviders = await getProvidersByUserId(existingUser.user_id);
      const hasGoogle = existingProviders.some(p => p.provider === 'google');
      if (!hasGoogle) {
        logger.warn({ email: payload.email, requestId }, 'Google auth: email already registered under a different provider');
        throw createAuthError(
          'Unable to create account. If you already have an account, try signing in or use "Forgot sign-in method".',
          'REGISTRATION_FAILED',
          409
        );
      }
    }

    // Upsert user in database
    const user = await upsertUser({
      user_id: payload.sub,
      email: payload.email,
      name: payload.name || null,
      picture_url: payload.picture || null,
    });

    // Backfill auth_providers row for Google (lazy migration)
    await createAuthProvider({
      user_id: user.user_id,
      provider: 'google',
      provider_user_id: payload.sub,
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
   * Register a new user with email and password.
   */
  async registerWithEmail(
    email: string,
    name: string,
    password: string,
    requestId: string
  ): Promise<AuthResult> {
    // Check if email already exists — generic message to prevent user enumeration
    const existing = await getUserByEmail(email);
    if (existing) {
      logger.warn({ email, existingUserId: existing.user_id, requestId }, 'Registration collision');
      throw createAuthError(
        'Unable to create account. If you already have an account, try signing in or use "Forgot sign-in method".',
        'REGISTRATION_FAILED',
        409
      );
    }

    // Hash password and create user
    const password_hash = await hashPassword(password);
    const user_id = uuidv4();

    const user = await createEmailUser({ user_id, email, name, password_hash });

    // Create auth provider mapping
    await createAuthProvider({ user_id, provider: 'email', provider_user_id: user_id });

    // Create tokens
    const tokenPair = createTokenPair({
      user_id: user.user_id,
      email: user.email,
      roles: user.roles,
    });

    await createRefreshToken({
      user_id: user.user_id,
      token_hash: hashToken(tokenPair.refreshToken),
      expires_at: tokenPair.refreshExpiresAt,
    });

    logger.info({ userId: user.user_id, email: user.email, requestId }, 'Email user registered');

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
   * Authenticate a user with email and password.
   */
  async loginWithEmail(
    email: string,
    password: string,
    requestId: string
  ): Promise<AuthResult> {
    // 1. Read-only check: is this email already rate-limited?
    const limited = await rateLimit.isLoginLimited(email);
    if (limited) {
      logger.warn({ email, requestId }, 'Login rate limit exceeded');
      throw createAuthError('Too many login attempts. Please try again later.', 'RATE_LIMITED', 429);
    }

    // 2. DB lookup + password verify
    const userWithHash = await getUserByEmailWithHash(email);

    if (!userWithHash || !userWithHash.password_hash) {
      // 3. On failure: increment counter (one attempt burned)
      await rateLimit.recordFailedLogin(email);
      throw createAuthError('Invalid email or password.', 'INVALID_CREDENTIALS', 401);
    }

    const isValid = await verifyPassword(password, userWithHash.password_hash);
    if (!isValid) {
      // 3. On failure: increment counter (one attempt burned)
      await rateLimit.recordFailedLogin(email);
      logger.warn({ email, requestId }, 'Invalid password attempt');
      throw createAuthError('Invalid email or password.', 'INVALID_CREDENTIALS', 401);
    }

    // 4. On success: reset counter
    await rateLimit.resetLoginEmail(email);

    await updateLastLogin(userWithHash.user_id);

    // Strip password_hash at service boundary (Fix 7)
    const { password_hash: _, ...userWithoutHash } = userWithHash;

    const tokenPair = createTokenPair({
      user_id: userWithHash.user_id,
      email: userWithHash.email,
      roles: userWithHash.roles,
    });

    await createRefreshToken({
      user_id: userWithHash.user_id,
      token_hash: hashToken(tokenPair.refreshToken),
      expires_at: tokenPair.refreshExpiresAt,
    });

    logger.info({ userId: userWithHash.user_id, email, requestId }, 'Email user authenticated');

    return {
      user: userWithoutHash as UserRow,
      tokens: {
        access_token: tokenPair.accessToken,
        refresh_token: tokenPair.refreshToken,
        expires_at: tokenPair.accessExpiresAt.toISOString(),
      },
    };
  }

  /**
   * Initiate Facebook OAuth flow with PKCE.
   */
  async initiateFacebookOAuth(): Promise<OAuthInitiation> {
    if (!isFacebookConfigured()) {
      throw createAuthError('Facebook login is not configured', 'OAUTH_INIT_FAILED', 503);
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateSecureString(32);

    await redis.storePKCEState(state, codeVerifier, 600);

    const params = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      redirect_uri: FACEBOOK_REDIRECT_URI,
      state,
      scope: 'email,public_profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authorization_url = `https://www.facebook.com/${FACEBOOK_API_VERSION}/dialog/oauth?${params.toString()}`;

    logger.info({ state: state.substring(0, 8) + '...' }, 'Facebook OAuth flow initiated');

    return { authorization_url, state };
  }

  /**
   * Handle Facebook OAuth callback.
   */
  async handleFacebookCallback(
    code: string,
    state: string,
    requestId: string
  ): Promise<AuthResult> {
    if (!isFacebookConfigured()) {
      throw createAuthError('Facebook login is not configured', 'OAUTH_INIT_FAILED', 503);
    }

    const codeVerifier = await redis.consumePKCEState(state);
    if (!codeVerifier) {
      logger.warn({ requestId, state: state.substring(0, 8) + '...' }, 'Invalid or expired Facebook PKCE state');
      throw createAuthError('Invalid or expired state parameter', 'INVALID_STATE', 400);
    }

    // Exchange code for access token
    const tokenParams = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      code,
      redirect_uri: FACEBOOK_REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    let fbAccessToken: string;
    try {
      const tokenRes = await fetch(
        `https://graph.facebook.com/${FACEBOOK_API_VERSION}/oauth/access_token?${tokenParams.toString()}`
      );
      if (!tokenRes.ok) {
        throw new Error(`Facebook token exchange failed: ${tokenRes.status}`);
      }
      const tokenData = (await tokenRes.json()) as { access_token: string };
      fbAccessToken = tokenData.access_token;
    } catch (error) {
      logger.error({ error, requestId }, 'Facebook token exchange failed');
      throw createAuthError('Failed to exchange Facebook authorization code', 'OAUTH_EXCHANGE_FAILED', 401);
    }

    // Generate appsecret_proof for server-side API security
    const appsecretProof = crypto.createHmac('sha256', FACEBOOK_APP_SECRET)
      .update(fbAccessToken).digest('hex');

    // Get user info from Facebook Graph API — token in Authorization header, not URL
    const graphParams = new URLSearchParams({
      fields: 'id,name,email,picture.type(large)',
      appsecret_proof: appsecretProof,
    });

    let fbUser: { id: string; name: string; email?: string; picture?: { data?: { url?: string } } };
    try {
      const userRes = await fetch(
        `https://graph.facebook.com/${FACEBOOK_API_VERSION}/me?${graphParams.toString()}`,
        { headers: { Authorization: `Bearer ${fbAccessToken}` } }
      );
      if (!userRes.ok) {
        throw new Error(`Facebook user info failed: ${userRes.status}`);
      }
      fbUser = (await userRes.json()) as typeof fbUser;
    } catch (error) {
      logger.error({ error, requestId }, 'Failed to fetch Facebook user info');
      throw createAuthError('Failed to retrieve Facebook user info', 'OAUTH_EXCHANGE_FAILED', 401);
    }

    if (!fbUser.email) {
      throw createAuthError(
        'Your Facebook account does not have an email address.',
        'EMAIL_NOT_VERIFIED',
        403
      );
    }

    const pictureUrl = fbUser.picture?.data?.url || null;

    // Check if user already registered via Facebook
    const existingUserId = await findUserByProvider('facebook', fbUser.id);

    let user: UserRow;
    if (existingUserId) {
      const existingUser = await getUserById(existingUserId);
      if (!existingUser) {
        throw createAuthError('User not found', 'OAUTH_EXCHANGE_FAILED', 401);
      }
      user = existingUser;
      await updateLastLogin(user.user_id);
    } else {
      // Check for cross-provider email collision — generic message to prevent enumeration
      const emailUser = await getUserByEmail(fbUser.email);
      if (emailUser) {
        logger.warn({ email: fbUser.email, requestId }, 'Facebook auth: email already registered under a different provider');
        throw createAuthError(
          'Unable to create account. If you already have an account, try signing in or use "Forgot sign-in method".',
          'REGISTRATION_FAILED',
          409
        );
      }

      // New user — create with UUID
      const new_user_id = uuidv4();
      user = await upsertUser({
        user_id: new_user_id,
        email: fbUser.email,
        name: fbUser.name,
        picture_url: pictureUrl,
      });
    }

    // Ensure auth_providers row exists
    await createAuthProvider({
      user_id: user.user_id,
      provider: 'facebook',
      provider_user_id: fbUser.id,
    });

    const tokenPair = createTokenPair({
      user_id: user.user_id,
      email: user.email,
      roles: user.roles,
    });

    await createRefreshToken({
      user_id: user.user_id,
      token_hash: hashToken(tokenPair.refreshToken),
      expires_at: tokenPair.refreshExpiresAt,
    });

    logger.info({ userId: user.user_id, email: user.email, requestId }, 'Facebook user authenticated');

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
    const expiryMs = parseDurationMs(JWT_ACCESS_EXPIRY, 'JWT_ACCESS_EXPIRY');
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

// Export singleton instance
export const authService = new AuthService();
export default authService;
