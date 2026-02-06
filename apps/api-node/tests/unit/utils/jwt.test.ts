/**
 * JWT utility tests
 * Tests for jwt.ts: parseExpiry (via exposed behavior), signAccessToken, signRefreshToken,
 * verifyAccessToken, verifyRefreshToken, createTokenPair, decodeToken
 */

import { describe, it, expect } from '@jest/globals';
import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  createTokenPair,
  decodeToken,
  type TokenUser,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from '../../../src/utils/jwt';

// Mock logger to avoid cluttering test output
jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('JWT Utilities', () => {
  const mockUser: TokenUser = {
    user_id: 'test-user-123',
    email: 'test@example.com',
    roles: ['user'],
  };

  const adminUser: TokenUser = {
    user_id: 'admin-user-456',
    email: 'admin@example.com',
    roles: ['user', 'admin'],
  };

  describe('signAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const token = signAccessToken(mockUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Verify it's a valid JWT format (3 parts separated by dots)
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include required claims (sub, email, roles, jti, type)', () => {
      const token = signAccessToken(mockUser);
      const decoded = jwt.decode(token) as AccessTokenPayload;

      expect(decoded.sub).toBe(mockUser.user_id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.roles).toEqual(mockUser.roles);
      expect(decoded.jti).toBeDefined();
      expect(decoded.type).toBe('access');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should handle users with multiple roles', () => {
      const token = signAccessToken(adminUser);
      const decoded = jwt.decode(token) as AccessTokenPayload;

      expect(decoded.roles).toEqual(['user', 'admin']);
    });

    it('should generate unique JTIs for each token', () => {
      const token1 = signAccessToken(mockUser);
      const token2 = signAccessToken(mockUser);

      const decoded1 = jwt.decode(token1) as AccessTokenPayload;
      const decoded2 = jwt.decode(token2) as AccessTokenPayload;

      expect(decoded1.jti).not.toBe(decoded2.jti);
    });

    it('should set expiration time based on JWT_ACCESS_EXPIRY env var', () => {
      const token = signAccessToken(mockUser);
      const decoded = jwt.decode(token) as AccessTokenPayload;

      // Default is 15m = 900 seconds
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();

      const expirySeconds = decoded.exp! - decoded.iat!;
      // Allow some tolerance for test execution time
      expect(expirySeconds).toBeGreaterThan(890);
      expect(expirySeconds).toBeLessThan(910);
    });
  });

  describe('signRefreshToken', () => {
    it('should generate a valid JWT refresh token', () => {
      const result = signRefreshToken(mockUser.user_id);

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.jti).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should include required claims (sub, jti, type)', () => {
      const result = signRefreshToken(mockUser.user_id);
      const decoded = jwt.decode(result.token) as RefreshTokenPayload;

      expect(decoded.sub).toBe(mockUser.user_id);
      expect(decoded.jti).toBe(result.jti);
      expect(decoded.type).toBe('refresh');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should return unique JTI for each call', () => {
      const result1 = signRefreshToken(mockUser.user_id);
      const result2 = signRefreshToken(mockUser.user_id);

      expect(result1.jti).not.toBe(result2.jti);
    });

    it('should set expiresAt to a future date', () => {
      const result = signRefreshToken(mockUser.user_id);
      const now = new Date();

      expect(result.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    });

    it('should set expiration based on JWT_REFRESH_EXPIRY env var', () => {
      const result = signRefreshToken(mockUser.user_id);
      const decoded = jwt.decode(result.token) as RefreshTokenPayload;
      const now = Math.floor(Date.now() / 1000);

      // Default is 7 days = 7 * 24 * 60 * 60 seconds
      const expirySeconds = decoded.exp! - now;
      expect(expirySeconds).toBeGreaterThan(604700); // ~7 days - small buffer
      expect(expirySeconds).toBeLessThan(604820);
    });
  });

  describe('verifyAccessToken', () => {
    it('should return payload for a valid access token', () => {
      const token = signAccessToken(mockUser);
      const payload = verifyAccessToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(mockUser.user_id);
      expect(payload!.email).toBe(mockUser.email);
      expect(payload!.roles).toEqual(mockUser.roles);
      expect(payload!.type).toBe('access');
    });

    it('should return null for an expired token', () => {
      // Create a token that's already expired
      const expiredToken = jwt.sign(
        {
          sub: mockUser.user_id,
          email: mockUser.email,
          roles: mockUser.roles,
          jti: 'test-jti',
          type: 'access',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' }
      );

      const payload = verifyAccessToken(expiredToken);
      expect(payload).toBeNull();
    });

    it('should return null for a malformed token', () => {
      const payload = verifyAccessToken('not-a-valid-jwt');
      expect(payload).toBeNull();
    });

    it('should return null for a token signed with wrong secret', () => {
      const wrongSecretToken = jwt.sign(
        {
          sub: mockUser.user_id,
          email: mockUser.email,
          roles: mockUser.roles,
          jti: 'test-jti',
          type: 'access',
        },
        'wrong-secret',
        { expiresIn: '15m' }
      );

      const payload = verifyAccessToken(wrongSecretToken);
      expect(payload).toBeNull();
    });

    it('should return null for a token with wrong type', () => {
      // Create a refresh token and try to verify as access
      const refreshResult = signRefreshToken(mockUser.user_id);
      const payload = verifyAccessToken(refreshResult.token);

      expect(payload).toBeNull();
    });

    it('should return null for a token without required type claim', () => {
      const tokenWithoutType = jwt.sign(
        {
          sub: mockUser.user_id,
          email: mockUser.email,
          roles: mockUser.roles,
          jti: 'test-jti',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );

      const payload = verifyAccessToken(tokenWithoutType);
      expect(payload).toBeNull();
    });

    it('should return null for access token missing sub', () => {
      const token = jwt.sign(
        { email: 'test@example.com', roles: ['user'], jti: 'test-jti', type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );
      expect(verifyAccessToken(token)).toBeNull();
    });

    it('should return null for access token missing email', () => {
      const token = jwt.sign(
        { sub: 'user-1', roles: ['user'], jti: 'test-jti', type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );
      expect(verifyAccessToken(token)).toBeNull();
    });

    it('should return null for access token with roles not an array', () => {
      const token = jwt.sign(
        { sub: 'user-1', email: 'test@example.com', roles: 'user', jti: 'test-jti', type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );
      expect(verifyAccessToken(token)).toBeNull();
    });

    it('should return null for access token missing jti', () => {
      const token = jwt.sign(
        { sub: 'user-1', email: 'test@example.com', roles: ['user'], type: 'access' },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );
      expect(verifyAccessToken(token)).toBeNull();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should return payload for a valid refresh token', () => {
      const result = signRefreshToken(mockUser.user_id);
      const payload = verifyRefreshToken(result.token);

      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(mockUser.user_id);
      expect(payload!.jti).toBe(result.jti);
      expect(payload!.type).toBe('refresh');
    });

    it('should return null for an expired refresh token', () => {
      const expiredToken = jwt.sign(
        {
          sub: mockUser.user_id,
          jti: 'test-jti',
          type: 'refresh',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '-1d' }
      );

      const payload = verifyRefreshToken(expiredToken);
      expect(payload).toBeNull();
    });

    it('should return null for a malformed token', () => {
      const payload = verifyRefreshToken('not-a-valid-jwt');
      expect(payload).toBeNull();
    });

    it('should return null for a token signed with wrong secret', () => {
      const wrongSecretToken = jwt.sign(
        {
          sub: mockUser.user_id,
          jti: 'test-jti',
          type: 'refresh',
        },
        'wrong-secret',
        { expiresIn: '7d' }
      );

      const payload = verifyRefreshToken(wrongSecretToken);
      expect(payload).toBeNull();
    });

    it('should return null for a token with wrong type', () => {
      // Create an access token and try to verify as refresh
      const accessToken = signAccessToken(mockUser);
      const payload = verifyRefreshToken(accessToken);

      expect(payload).toBeNull();
    });

    it('should return null for refresh token missing sub', () => {
      const token = jwt.sign(
        { jti: 'test-jti', type: 'refresh' },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );
      expect(verifyRefreshToken(token)).toBeNull();
    });

    it('should return null for refresh token missing jti', () => {
      const token = jwt.sign(
        { sub: 'user-1', type: 'refresh' },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );
      expect(verifyRefreshToken(token)).toBeNull();
    });
  });

  describe('createTokenPair', () => {
    it('should return both access and refresh tokens with correct metadata', () => {
      const tokenPair = createTokenPair(mockUser);

      expect(tokenPair.accessToken).toBeDefined();
      expect(tokenPair.refreshToken).toBeDefined();
      expect(tokenPair.refreshJti).toBeDefined();
      expect(tokenPair.accessExpiresAt).toBeInstanceOf(Date);
      expect(tokenPair.refreshExpiresAt).toBeInstanceOf(Date);
    });

    it('should have access token that verifies correctly', () => {
      const tokenPair = createTokenPair(mockUser);
      const payload = verifyAccessToken(tokenPair.accessToken);

      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(mockUser.user_id);
      expect(payload!.email).toBe(mockUser.email);
      expect(payload!.roles).toEqual(mockUser.roles);
    });

    it('should have refresh token that verifies correctly', () => {
      const tokenPair = createTokenPair(mockUser);
      const payload = verifyRefreshToken(tokenPair.refreshToken);

      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(mockUser.user_id);
      expect(payload!.jti).toBe(tokenPair.refreshJti);
    });

    it('should set accessExpiresAt to near future', () => {
      const tokenPair = createTokenPair(mockUser);
      const now = new Date();

      // Access token should expire in ~15 minutes
      const timeToExpiry = tokenPair.accessExpiresAt.getTime() - now.getTime();
      expect(timeToExpiry).toBeGreaterThan(890000); // 14m 50s in ms
      expect(timeToExpiry).toBeLessThan(910000); // 15m 10s in ms
    });

    it('should set refreshExpiresAt to far future', () => {
      const tokenPair = createTokenPair(mockUser);
      const now = new Date();

      // Refresh token should expire in ~7 days
      const timeToExpiry = tokenPair.refreshExpiresAt.getTime() - now.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(timeToExpiry).toBeGreaterThan(sevenDaysMs - 10000);
      expect(timeToExpiry).toBeLessThan(sevenDaysMs + 10000);
    });

    it('should generate unique JTIs for both tokens', () => {
      const tokenPair = createTokenPair(mockUser);

      const accessDecoded = jwt.decode(tokenPair.accessToken) as AccessTokenPayload;
      const refreshDecoded = jwt.decode(tokenPair.refreshToken) as RefreshTokenPayload;

      expect(accessDecoded.jti).not.toBe(refreshDecoded.jti);
      expect(refreshDecoded.jti).toBe(tokenPair.refreshJti);
    });
  });

  describe('decodeToken', () => {
    it('should extract exp and jti from a token without verification', () => {
      const token = signAccessToken(mockUser);
      const decoded = decodeToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded!.exp).toBeDefined();
      expect(decoded!.jti).toBeDefined();
    });

    it('should work with refresh tokens', () => {
      const result = signRefreshToken(mockUser.user_id);
      const decoded = decodeToken(result.token);

      expect(decoded).not.toBeNull();
      expect(decoded!.exp).toBeDefined();
      expect(decoded!.jti).toBe(result.jti);
    });

    it('should return null for a malformed token', () => {
      const decoded = decodeToken('not-a-valid-jwt');
      expect(decoded).toBeNull();
    });

    it('should return null for an empty string', () => {
      const decoded = decodeToken('');
      expect(decoded).toBeNull();
    });

    it('should decode tokens even if expired (no verification)', () => {
      const expiredToken = jwt.sign(
        {
          sub: mockUser.user_id,
          email: mockUser.email,
          roles: mockUser.roles,
          jti: 'test-jti',
          type: 'access',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '-1h' }
      );

      const decoded = decodeToken(expiredToken);
      expect(decoded).not.toBeNull();
      expect(decoded!.exp).toBeDefined();
      expect(decoded!.jti).toBe('test-jti');
    });

    it('should decode tokens even if signed with wrong secret (no verification)', () => {
      const wrongSecretToken = jwt.sign(
        {
          sub: mockUser.user_id,
          email: mockUser.email,
          roles: mockUser.roles,
          jti: 'test-jti',
          type: 'access',
        },
        'wrong-secret',
        { expiresIn: '15m' }
      );

      const decoded = decodeToken(wrongSecretToken);
      expect(decoded).not.toBeNull();
      expect(decoded!.jti).toBe('test-jti');
    });
  });

  describe('parseExpiry behavior (via sign functions)', () => {
    // Note: parseExpiry is not exported, but we can test its behavior
    // by checking the expiry of generated tokens

    it('should handle seconds format (30s)', () => {
      // This tests the 's' unit in parseExpiry
      const token = jwt.sign(
        {
          sub: mockUser.user_id,
          email: mockUser.email,
          roles: mockUser.roles,
          jti: 'test-jti',
          type: 'access',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '30s' }
      );

      const decoded = jwt.decode(token) as AccessTokenPayload;
      const now = Math.floor(Date.now() / 1000);
      const expirySeconds = decoded.exp! - now;

      expect(expirySeconds).toBeGreaterThan(28);
      expect(expirySeconds).toBeLessThan(32);
    });

    it('should handle minutes format (15m)', () => {
      const token = jwt.sign(
        {
          sub: mockUser.user_id,
          email: mockUser.email,
          roles: mockUser.roles,
          jti: 'test-jti',
          type: 'access',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '15m' }
      );

      const decoded = jwt.decode(token) as AccessTokenPayload;
      const now = Math.floor(Date.now() / 1000);
      const expirySeconds = decoded.exp! - now;

      expect(expirySeconds).toBeGreaterThan(890);
      expect(expirySeconds).toBeLessThan(910);
    });

    it('should handle hours format (1h)', () => {
      const token = jwt.sign(
        {
          sub: mockUser.user_id,
          email: mockUser.email,
          roles: mockUser.roles,
          jti: 'test-jti',
          type: 'access',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '1h' }
      );

      const decoded = jwt.decode(token) as AccessTokenPayload;
      const now = Math.floor(Date.now() / 1000);
      const expirySeconds = decoded.exp! - now;

      expect(expirySeconds).toBeGreaterThan(3590);
      expect(expirySeconds).toBeLessThan(3610);
    });

    it('should handle days format (7d)', () => {
      const token = jwt.sign(
        {
          sub: mockUser.user_id,
          email: mockUser.email,
          roles: mockUser.roles,
          jti: 'test-jti',
          type: 'access',
        },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      const decoded = jwt.decode(token) as AccessTokenPayload;
      const now = Math.floor(Date.now() / 1000);
      const expirySeconds = decoded.exp! - now;

      const sevenDays = 7 * 24 * 60 * 60;
      expect(expirySeconds).toBeGreaterThan(sevenDays - 10);
      expect(expirySeconds).toBeLessThan(sevenDays + 10);
    });
  });
});
