/**
 * Auth middleware tests
 * Tests for auth.middleware.ts: requireAuth, requireRole, optionalAuth functions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  requireAuth,
  requireRole,
  optionalAuth,
} from '../../../src/middleware/auth.middleware';
import { redis } from '../../../src/db/redis';
import {
  createMockRequest,
  createMockRequestWithAuth,
  createMockResponse,
  createMockNextFunction,
} from '../../../tests/fixtures/express.mocks';

// Mock dependencies
jest.mock('../../../src/utils/jwt');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/db/redis');
jest.mock('../../../src/utils/cookies');

import { verifyAccessToken } from '../../../src/utils/jwt';
import { getAccessTokenFromCookies } from '../../../src/utils/cookies';
import logger from '../../../src/utils/logger';

// Type assertions for mocked functions
const mockedVerifyAccessToken = verifyAccessToken as jest.MockedFunction<typeof verifyAccessToken>;
const mockedGetAccessTokenFromCookies = getAccessTokenFromCookies as jest.MockedFunction<typeof getAccessTokenFromCookies>;
const mockedRedis = redis as jest.Mocked<typeof redis>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const mockUserPayload = {
    sub: 'test-user-123',
    email: 'test@example.com',
    roles: ['user'],
    jti: 'test-jti-123',
    type: 'access' as const,
    exp: Math.floor(Date.now() / 1000) + 900,
    iat: Math.floor(Date.now() / 1000),
  };

  const mockAdminPayload = {
    ...mockUserPayload,
    sub: 'admin-user-456',
    roles: ['user', 'admin'],
  };

  describe('requireAuth', () => {
    it('should call next() and set req.user with valid token in cookie', async () => {
      const req = createMockRequestWithAuth('valid-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('valid-token');
      mockedVerifyAccessToken.mockReturnValue(mockUserPayload);
      mockedRedis.isTokenBlacklisted.mockResolvedValue(false);

      await requireAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(1);
      expect(mockNext.lastError).toBeUndefined();
      expect(req.user).toEqual({
        user_id: mockUserPayload.sub,
        email: mockUserPayload.email,
        roles: mockUserPayload.roles,
        jti: mockUserPayload.jti,
        exp: mockUserPayload.exp,
      });
      expect(res.statusCode).toBe(200);
    });

    it('should return 401 UNAUTHORIZED when cookie is missing', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue(undefined);

      await requireAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({
        error: 'UNAUTHORIZED',
        message: 'Missing access token',
        request_id: 'unknown',
      });
    });

    it('should return 401 INVALID_TOKEN for malformed token', async () => {
      const req = createMockRequestWithAuth('malformed-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('malformed-token');
      mockedVerifyAccessToken.mockReturnValue(null);

      await requireAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
        request_id: 'unknown',
      });
    });

    it('should return 401 INVALID_TOKEN for expired token', async () => {
      const req = createMockRequestWithAuth('expired-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('expired-token');
      mockedVerifyAccessToken.mockReturnValue(null);

      await requireAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
        request_id: 'unknown',
      });
    });

    it('should return 401 TOKEN_REVOKED for blacklisted JTI', async () => {
      const req = createMockRequestWithAuth('valid-but-blacklisted-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('valid-but-blacklisted-token');
      mockedVerifyAccessToken.mockReturnValue(mockUserPayload);
      mockedRedis.isTokenBlacklisted.mockResolvedValue(true);

      await requireAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(0);
      expect(mockedRedis.isTokenBlacklisted).toHaveBeenCalledWith(mockUserPayload.jti);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({
        error: 'TOKEN_REVOKED',
        message: 'Token has been revoked',
        request_id: 'unknown',
      });
    });

    it('should return 503 when Redis is unavailable (fail-closed)', async () => {
      const req = createMockRequestWithAuth('valid-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('valid-token');
      mockedVerifyAccessToken.mockReturnValue(mockUserPayload);
      mockedRedis.isTokenBlacklisted.mockRejectedValue(new Error('Redis connection failed'));

      await requireAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(503);
      expect(res.jsonData).toEqual({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Authentication service temporarily unavailable',
        request_id: 'unknown',
      });
      expect(req.user).toBeUndefined();
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          jti: mockUserPayload.jti,
        }),
        'Redis unavailable for blacklist check'
      );
    });

    it('should include request_id from headers in error response', async () => {
      const req = createMockRequest();
      (req.headers as any)['x-request-id'] = 'test-request-123';
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue(undefined);

      await requireAuth(req as any, res as any, mockNext.next);

      expect(res.jsonData).toEqual(
        expect.objectContaining({
          request_id: 'test-request-123',
        })
      );
    });

    it('should handle token with wrong type (refresh token used as access)', async () => {
      const req = createMockRequestWithAuth('refresh-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('refresh-token');
      mockedVerifyAccessToken.mockReturnValue(null); // Wrong type returns null

      await requireAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(401);
      expect(res.jsonData).toEqual({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
        request_id: 'unknown',
      });
    });
  });

  describe('requireRole', () => {
    it('should call next() when user has the required role', () => {
      const req = createMockRequest({
        user: {
          user_id: 'admin-123',
          email: 'admin@example.com',
          roles: ['user', 'admin'],
        },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      const middleware = requireRole('admin');
      middleware(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(1);
      expect(mockNext.lastError).toBeUndefined();
    });

    it('should return 403 FORBIDDEN when user lacks the required role', () => {
      const req = createMockRequest({
        user: {
          user_id: 'user-123',
          email: 'user@example.com',
          roles: ['user'],
        },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      const middleware = requireRole('admin');
      middleware(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toEqual({
        error: 'FORBIDDEN',
        message: 'Required role: admin',
        request_id: 'unknown',
      });
    });

    it('should return 500 INTERNAL_ERROR when used without requireAuth', () => {
      const req = createMockRequest(); // No user set
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      const middleware = requireRole('admin');
      middleware(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(500);
      expect(res.jsonData).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Authentication middleware misconfigured',
        request_id: 'unknown',
      });
      expect(mockedLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          path: req.path,
        }),
        'requireRole used without requireAuth'
      );
    });

    it('should check for exact role match (case-sensitive)', () => {
      const req = createMockRequest({
        user: {
          user_id: 'user-123',
          email: 'user@example.com',
          roles: ['user', 'Admin'], // Capital A
        },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      const middleware = requireRole('admin'); // lowercase
      middleware(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(0);
      expect(res.statusCode).toBe(403);
    });

    it('should work with custom roles', () => {
      const req = createMockRequest({
        user: {
          user_id: 'moderator-123',
          email: 'mod@example.com',
          roles: ['user', 'moderator'],
        },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      const middleware = requireRole('moderator');
      middleware(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(1);
    });

    it('should allow multiple roles to be checked via chaining', () => {
      // This tests that requireRole can be chained for multiple role requirements
      const adminReq = createMockRequest({
        user: {
          user_id: 'admin-123',
          email: 'admin@example.com',
          roles: ['user', 'admin', 'moderator'],
        },
      });
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      const adminMiddleware = requireRole('admin');
      const modMiddleware = requireRole('moderator');

      // Both should pass for admin user
      adminMiddleware(adminReq as any, res as any, mockNext.next);
      expect(mockNext.calls).toBe(1);

      // Reset for second middleware
      mockNext.calls = 0;
      modMiddleware(adminReq as any, res as any, mockNext.next);
      expect(mockNext.calls).toBe(1);
    });
  });

  describe('optionalAuth', () => {
    it('should call next() without user when no token is present', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue(undefined);

      await optionalAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(1);
      expect(req.user).toBeUndefined();
    });

    it('should call next() and set req.user when valid token is present', async () => {
      const req = createMockRequestWithAuth('valid-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('valid-token');
      mockedVerifyAccessToken.mockReturnValue(mockUserPayload);
      mockedRedis.isTokenBlacklisted.mockResolvedValue(false);

      await optionalAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(1);
      expect(req.user).toEqual({
        user_id: mockUserPayload.sub,
        email: mockUserPayload.email,
        roles: mockUserPayload.roles,
        jti: mockUserPayload.jti,
        exp: mockUserPayload.exp,
      });
    });

    it('should call next() without user when token is invalid', async () => {
      const req = createMockRequestWithAuth('invalid-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('invalid-token');
      mockedVerifyAccessToken.mockReturnValue(null);

      await optionalAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(1);
      expect(req.user).toBeUndefined();
      expect(mockedLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          path: req.path,
        }),
        'Invalid optional auth token, continuing without user'
      );
    });

    it('should call next() without user when token is blacklisted', async () => {
      const req = createMockRequestWithAuth('blacklisted-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('blacklisted-token');
      mockedVerifyAccessToken.mockReturnValue(mockUserPayload);
      mockedRedis.isTokenBlacklisted.mockResolvedValue(true);

      await optionalAuth(req as any, res as any, mockNext.next);

      expect(mockNext.calls).toBe(1);
      expect(req.user).toBeUndefined();
      expect(mockedLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          jti: mockUserPayload.jti,
        }),
        'Optional auth token is blacklisted, continuing without user'
      );
    });

    it('should continue without user when Redis throws (anonymous fallback)', async () => {
      const req = createMockRequestWithAuth('valid-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('valid-token');
      mockedVerifyAccessToken.mockReturnValue(mockUserPayload);
      mockedRedis.isTokenBlacklisted.mockRejectedValue(new Error('Redis down'));

      await optionalAuth(req as any, res as any, mockNext.next);

      // Should continue without user (not attach user on Redis error)
      expect(mockNext.calls).toBe(1);
      expect(req.user).toBeUndefined();
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          jti: mockUserPayload.jti,
        }),
        'Redis unavailable for optional auth, continuing without user'
      );
    });

    it('should not send any response for invalid token (unlike requireAuth)', async () => {
      const req = createMockRequestWithAuth('invalid-token');
      const res = createMockResponse();
      const mockNext = createMockNextFunction();

      mockedGetAccessTokenFromCookies.mockReturnValue('invalid-token');
      mockedVerifyAccessToken.mockReturnValue(null);

      await optionalAuth(req as any, res as any, mockNext.next);

      // optionalAuth should not send a response
      expect(res.jsonData).toBeUndefined();
      expect(res.statusCode).toBe(200);
      expect(mockNext.calls).toBe(1);
    });
  });

  describe('integration scenarios', () => {
    it('should handle full auth flow with requireAuth and requireRole', async () => {
      const req = createMockRequestWithAuth('admin-token');
      const res = createMockResponse();
      const authNext = createMockNextFunction();
      const roleNext = createMockNextFunction();

      // Setup mocks
      mockedGetAccessTokenFromCookies.mockReturnValue('admin-token');
      mockedVerifyAccessToken.mockReturnValue(mockAdminPayload);
      mockedRedis.isTokenBlacklisted.mockResolvedValue(false);

      // Run requireAuth
      await requireAuth(req as any, res as any, authNext.next);
      expect(authNext.calls).toBe(1);
      expect(req.user).toBeDefined();

      // Run requireRole (simulating middleware chain)
      const roleMiddleware = requireRole('admin');
      roleMiddleware(req as any, res as any, roleNext.next);

      expect(roleNext.calls).toBe(1);
      expect(res.statusCode).toBe(200);
    });

    it('should reject at requireRole even if requireAuth passes', async () => {
      const req = createMockRequestWithAuth('user-token');
      const res = createMockResponse();
      const authNext = createMockNextFunction();
      const roleNext = createMockNextFunction();

      // Setup mocks for regular user
      mockedGetAccessTokenFromCookies.mockReturnValue('user-token');
      mockedVerifyAccessToken.mockReturnValue(mockUserPayload);
      mockedRedis.isTokenBlacklisted.mockResolvedValue(false);

      // Run requireAuth
      await requireAuth(req as any, res as any, authNext.next);
      expect(authNext.calls).toBe(1);
      expect(req.user).toBeDefined();

      // Reset response status
      res.statusCode = 200;

      // Run requireRole for admin
      const roleMiddleware = requireRole('admin');
      roleMiddleware(req as any, res as any, roleNext.next);

      expect(roleNext.calls).toBe(0);
      expect(res.statusCode).toBe(403);
    });
  });
});
