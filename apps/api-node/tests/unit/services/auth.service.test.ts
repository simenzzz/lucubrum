/**
 * Tests for auth.service.ts: registration, login, rate limiting,
 * enumeration prevention, Facebook OAuth, Google collision.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Set Facebook env vars before the service module loads (reads at import time)
process.env.FACEBOOK_APP_ID = 'test-fb-app-id';
process.env.FACEBOOK_APP_SECRET = 'test-fb-app-secret';
process.env.FACEBOOK_REDIRECT_URI = 'http://localhost:5173/oauth/facebook/callback';

// Manual mock for google-auth-library to avoid __mocks__ TS issue
jest.mock('google-auth-library', () => {
  const fn = jest.fn;
  return {
    OAuth2Client: fn().mockImplementation(() => ({
      generateAuthUrl: fn<any>().mockReturnValue('https://accounts.google.com/auth'),
      getToken: fn<any>().mockResolvedValue({ tokens: { id_token: 'id-token' } }),
      verifyIdToken: fn<any>().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-123',
          email: 'test@example.com',
          email_verified: true,
          name: 'Test User',
          picture: 'https://example.com/photo.jpg',
        }),
      }),
    })),
    CodeChallengeMethod: { S256: 'S256' },
  };
});

// Mock all external dependencies before importing the service
jest.mock('../../../src/db/redis');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/db/queries/users');
jest.mock('../../../src/db/queries/auth-providers');
jest.mock('../../../src/db/queries/tokens');
jest.mock('../../../src/utils/password');
jest.mock('../../../src/utils/jwt');
jest.mock('../../../src/middleware/rate-limit.middleware');

import {
  getUserByEmail,
  getUserByEmailWithHash,
  createEmailUser,
  getUserById,
  updateLastLogin,
  UserRow,
} from '../../../src/db/queries/users';

import {
  createAuthProvider,
  findUserByProvider,
  getProvidersByUserId,
} from '../../../src/db/queries/auth-providers';

import {
  createRefreshToken,
  hashToken,
} from '../../../src/db/queries/tokens';

import { hashPassword, verifyPassword } from '../../../src/utils/password';
import { createTokenPair } from '../../../src/utils/jwt';
import { rateLimit } from '../../../src/middleware/rate-limit.middleware';
import { redis } from '../../../src/db/redis';

const mockedGetUserByEmail = getUserByEmail as jest.MockedFunction<typeof getUserByEmail>;
const mockedGetUserByEmailWithHash = getUserByEmailWithHash as jest.MockedFunction<typeof getUserByEmailWithHash>;
const mockedCreateEmailUser = createEmailUser as jest.MockedFunction<typeof createEmailUser>;
const mockedGetUserById = getUserById as jest.MockedFunction<typeof getUserById>;
const mockedUpdateLastLogin = updateLastLogin as jest.MockedFunction<typeof updateLastLogin>;
const mockedCreateAuthProvider = createAuthProvider as jest.MockedFunction<typeof createAuthProvider>;
const mockedFindUserByProvider = findUserByProvider as jest.MockedFunction<typeof findUserByProvider>;
const mockedGetProvidersByUserId = getProvidersByUserId as jest.MockedFunction<typeof getProvidersByUserId>;
const mockedCreateRefreshToken = createRefreshToken as jest.MockedFunction<typeof createRefreshToken>;
const mockedHashToken = hashToken as jest.MockedFunction<typeof hashToken>;
const mockedHashPassword = hashPassword as jest.MockedFunction<typeof hashPassword>;
const mockedVerifyPassword = verifyPassword as jest.MockedFunction<typeof verifyPassword>;
const mockedCreateTokenPair = createTokenPair as jest.MockedFunction<typeof createTokenPair>;
const mockedRateLimit = rateLimit as jest.Mocked<typeof rateLimit>;
const mockedRedis = redis as jest.Mocked<typeof redis>;

// Import after mocks
import { authService, isFacebookConfigured } from '../../../src/services/auth.service';

// Test fixtures
const REQUEST_ID = 'test-request-id';
const TOKEN_PAIR = {
  accessToken: 'access-token-123',
  refreshToken: 'refresh-token-456',
  accessExpiresAt: new Date('2026-03-01T00:00:00Z'),
  refreshJti: 'refresh-jti-789',
  refreshExpiresAt: new Date('2026-03-08T00:00:00Z'),
};

function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    user_id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    picture_url: null,
    roles: ['user'],
    created_at: new Date('2026-01-01'),
    last_login_at: new Date('2026-02-01'),
    ...overrides,
  };
}

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default token pair mock
    mockedCreateTokenPair.mockReturnValue(TOKEN_PAIR);
    mockedHashToken.mockReturnValue('hashed-token');
    mockedCreateRefreshToken.mockResolvedValue(undefined as any);
    mockedCreateAuthProvider.mockResolvedValue(undefined);
    mockedUpdateLastLogin.mockResolvedValue(undefined as any);
  });

  // ─── registerWithEmail ──────────────────────────────────────────

  describe('registerWithEmail', () => {
    it('should create user, hash password, and return tokens on success', async () => {
      const user = makeUserRow();
      mockedGetUserByEmail.mockResolvedValue(null);
      mockedHashPassword.mockResolvedValue('hashed-password');
      mockedCreateEmailUser.mockResolvedValue(user);

      const result = await authService.registerWithEmail(
        'test@example.com', 'Test User', 'Password1', REQUEST_ID
      );

      expect(mockedHashPassword).toHaveBeenCalledWith('Password1');
      expect(mockedCreateEmailUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          name: 'Test User',
          password_hash: 'hashed-password',
        })
      );
      expect(result.user).toEqual(user);
      expect(result.tokens.access_token).toBe('access-token-123');
      expect(result.tokens.refresh_token).toBe('refresh-token-456');
    });

    it('should throw generic error on collision — no provider leak', async () => {
      const existing = makeUserRow();
      mockedGetUserByEmail.mockResolvedValue(existing);

      await expect(
        authService.registerWithEmail('test@example.com', 'Test User', 'Password1', REQUEST_ID)
      ).rejects.toMatchObject({
        code: 'REGISTRATION_FAILED',
        statusCode: 409,
      });

      // Verify the error message does NOT mention providers
      try {
        await authService.registerWithEmail('test@example.com', 'Test User', 'Password1', REQUEST_ID);
      } catch (e: any) {
        expect(e.message).not.toContain('OAuth');
        expect(e.message).not.toContain('Google');
        expect(e.message).not.toContain('Facebook');
        expect(e.message).not.toContain('email');
      }
    });
  });

  // ─── loginWithEmail ─────────────────────────────────────────────

  describe('loginWithEmail', () => {
    const userWithHash = {
      ...makeUserRow(),
      password_hash: 'hashed-pw',
    };

    it('should return user without password_hash and tokens on success', async () => {
      mockedRateLimit.isLoginLimited.mockResolvedValue(false);
      mockedGetUserByEmailWithHash.mockResolvedValue(userWithHash);
      mockedVerifyPassword.mockResolvedValue(true);

      const result = await authService.loginWithEmail(
        'test@example.com', 'Password1', REQUEST_ID
      );

      expect(result.tokens.access_token).toBe('access-token-123');
      // Verify password_hash is NOT in the returned user
      expect((result.user as any).password_hash).toBeUndefined();
      expect(mockedRateLimit.resetLoginEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should increment rate limit on wrong password', async () => {
      mockedRateLimit.isLoginLimited.mockResolvedValue(false);
      mockedGetUserByEmailWithHash.mockResolvedValue(userWithHash);
      mockedVerifyPassword.mockResolvedValue(false);

      await expect(
        authService.loginWithEmail('test@example.com', 'wrong', REQUEST_ID)
      ).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
        statusCode: 401,
      });

      expect(mockedRateLimit.recordFailedLogin).toHaveBeenCalledWith('test@example.com');
    });

    it('should increment rate limit on non-existent user', async () => {
      mockedRateLimit.isLoginLimited.mockResolvedValue(false);
      mockedGetUserByEmailWithHash.mockResolvedValue(null);

      await expect(
        authService.loginWithEmail('noone@example.com', 'Password1', REQUEST_ID)
      ).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
        statusCode: 401,
      });

      expect(mockedRateLimit.recordFailedLogin).toHaveBeenCalledWith('noone@example.com');
    });

    it('should reject before DB lookup when rate limited', async () => {
      mockedRateLimit.isLoginLimited.mockResolvedValue(true);

      await expect(
        authService.loginWithEmail('test@example.com', 'Password1', REQUEST_ID)
      ).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        statusCode: 429,
      });

      // Verify no DB calls were made
      expect(mockedGetUserByEmailWithHash).not.toHaveBeenCalled();
    });

    it('should reset rate limit on successful login', async () => {
      mockedRateLimit.isLoginLimited.mockResolvedValue(false);
      mockedGetUserByEmailWithHash.mockResolvedValue(userWithHash);
      mockedVerifyPassword.mockResolvedValue(true);

      await authService.loginWithEmail('test@example.com', 'Password1', REQUEST_ID);

      expect(mockedRateLimit.resetLoginEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  // ─── handleFacebookCallback ─────────────────────────────────────

  describe('handleFacebookCallback', () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = originalFetch; });

    it('should reject with INVALID_STATE when PKCE state is expired', async () => {
      mockedRedis.consumePKCEState.mockResolvedValue(null);

      await expect(
        authService.handleFacebookCallback('code', 'bad-state', REQUEST_ID)
      ).rejects.toMatchObject({
        code: 'INVALID_STATE',
        statusCode: 400,
      });
    });

    it('should throw generic error on email collision', async () => {
      // Setup: valid PKCE state
      mockedRedis.consumePKCEState.mockResolvedValue('verifier-123');

      // Mock global fetch for token exchange and user info
      const mockFetch = jest.fn<typeof globalThis.fetch>();
      globalThis.fetch = mockFetch;

      // Token exchange response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'fb-token' }),
      } as Response);

      // User info response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'fb-123',
          name: 'FB User',
          email: 'existing@example.com',
          picture: { data: { url: 'https://pic.com/photo.jpg' } },
        }),
      } as Response);

      // No existing Facebook provider mapping
      mockedFindUserByProvider.mockResolvedValue(null);
      // But email exists under a different provider
      mockedGetUserByEmail.mockResolvedValue(makeUserRow({ email: 'existing@example.com' }));

      await expect(
        authService.handleFacebookCallback('code', 'valid-state', REQUEST_ID)
      ).rejects.toMatchObject({
        code: 'REGISTRATION_FAILED',
        statusCode: 409,
      });

      // Verify message is generic — no provider info
      try {
        // Re-setup mocks since they were consumed
        mockedRedis.consumePKCEState.mockResolvedValue('verifier-123');
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'fb-token' }),
        } as Response);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'fb-123', name: 'FB User', email: 'existing@example.com',
          }),
        } as Response);
        mockedFindUserByProvider.mockResolvedValue(null);
        mockedGetUserByEmail.mockResolvedValue(makeUserRow());

        await authService.handleFacebookCallback('code', 'valid-state', REQUEST_ID);
      } catch (e: any) {
        expect(e.message).not.toContain('different account');
        expect(e.message).not.toContain('original method');
      }
    });
  });

  // ─── isFacebookConfigured ───────────────────────────────────────

  describe('isFacebookConfigured', () => {
    it('should return true when all FB env vars are set', () => {
      expect(isFacebookConfigured()).toBe(true);
    });
  });

  // ─── Google collision check ─────────────────────────────────────

  describe('handleGoogleCallback — collision check', () => {
    it('should throw REGISTRATION_FAILED 409 when email exists under different provider', async () => {
      // Valid PKCE state
      mockedRedis.consumePKCEState.mockResolvedValue('verifier-123');

      // Email exists under 'email' provider (no google)
      const existingUser = makeUserRow({ email: 'test@example.com' });
      mockedFindUserByProvider.mockResolvedValue(null);
      mockedGetUserByEmail.mockResolvedValue(existingUser);
      mockedGetProvidersByUserId.mockResolvedValue([
        { provider: 'email', provider_user_id: existingUser.user_id },
      ]);

      await expect(
        authService.handleGoogleCallback('auth-code', 'valid-state', REQUEST_ID)
      ).rejects.toMatchObject({
        code: 'REGISTRATION_FAILED',
        statusCode: 409,
      });

      expect(mockedGetProvidersByUserId).toHaveBeenCalledWith(existingUser.user_id);
    });
  });
});
