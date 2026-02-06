/**
 * Cookies utility tests
 * Tests for cookies.ts: getAccessTokenFromCookies, getRefreshTokenFromCookies, setAuthCookies, clearAuthCookies
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Response } from 'express';
import type { CookieOptions } from 'express';
import {
  getAccessTokenFromCookies,
  getRefreshTokenFromCookies,
  setAuthCookies,
  clearAuthCookies,
} from '../../../src/utils/cookies';
import { parseDurationMs } from '../../../src/utils/duration';

// Mock logger
jest.mock('../../../src/utils/logger');

describe('Cookies Utility', () => {
  describe('getAccessTokenFromCookies', () => {
    it('should return token for valid string cookie', () => {
      const cookies = {
        access_token: 'valid-token-abc123',
        other_cookie: 'value',
      };

      const result = getAccessTokenFromCookies(cookies);

      expect(result).toBe('valid-token-abc123');
    });

    it('should return undefined when cookie is missing', () => {
      const cookies = {
        other_cookie: 'value',
      };

      const result = getAccessTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should return undefined when cookie is an array (array injection protection)', () => {
      const cookies = {
        access_token: ['malicious-token-1', 'malicious-token-2'],
      };

      const result = getAccessTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should return undefined when cookie is null', () => {
      const cookies = {
        access_token: null,
      };

      const result = getAccessTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should return undefined when cookie is a number', () => {
      const cookies = {
        access_token: 12345,
      };

      const result = getAccessTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should return undefined when cookie is an object', () => {
      const cookies = {
        access_token: { token: 'value' },
      };

      const result = getAccessTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should return undefined for empty object', () => {
      const cookies = {};

      const result = getAccessTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should handle empty string token', () => {
      const cookies = {
        access_token: '',
      };

      const result = getAccessTokenFromCookies(cookies);

      expect(result).toBe('');
    });
  });

  describe('getRefreshTokenFromCookies', () => {
    it('should return token for valid string cookie', () => {
      const cookies = {
        refresh_token: 'valid-refresh-token-xyz789',
        other_cookie: 'value',
      };

      const result = getRefreshTokenFromCookies(cookies);

      expect(result).toBe('valid-refresh-token-xyz789');
    });

    it('should return undefined when cookie is missing', () => {
      const cookies = {
        other_cookie: 'value',
      };

      const result = getRefreshTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should return undefined when cookie is an array (array injection protection)', () => {
      const cookies = {
        refresh_token: ['malicious-1', 'malicious-2'],
      };

      const result = getRefreshTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should return undefined when cookie is null', () => {
      const cookies = {
        refresh_token: null,
      };

      const result = getRefreshTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should return undefined when cookie is a number', () => {
      const cookies = {
        refresh_token: 999,
      };

      const result = getRefreshTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should return undefined for empty object', () => {
      const cookies = {};

      const result = getRefreshTokenFromCookies(cookies);

      expect(result).toBeUndefined();
    });

    it('should handle both tokens simultaneously', () => {
      const cookies = {
        access_token: 'access-123',
        refresh_token: 'refresh-456',
      };

      const access = getAccessTokenFromCookies(cookies);
      const refresh = getRefreshTokenFromCookies(cookies);

      expect(access).toBe('access-123');
      expect(refresh).toBe('refresh-456');
    });
  });

  describe('setAuthCookies', () => {
    let mockRes: Partial<Response>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cookieCalls: Array<{ name: string; value: string; options: any }>;

    beforeEach(() => {
      cookieCalls = [];
      mockRes = {
        cookie: (jest.fn() as any).mockImplementation((name: string, value: string, options: CookieOptions): Response => {
          cookieCalls.push({ name, value, options });
          return mockRes as Response;
        }),
      };
    });

    it('should set access token with correct options', () => {
      const accessToken = 'test-access-token';

      setAuthCookies(mockRes as Response, accessToken);

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        accessToken,
        expect.objectContaining({
          httpOnly: true,
          secure: false, // false in test environment
          sameSite: 'lax',
          maxAge: expect.any(Number),
          path: '/',
        })
      );

      const accessCall = cookieCalls.find((c) => c.name === 'access_token');
      expect(accessCall).toBeDefined();
      expect(accessCall!.value).toBe(accessToken);
      expect(accessCall!.options.httpOnly).toBe(true);
      expect(accessCall!.options.sameSite).toBe('lax');
      expect(accessCall!.options.path).toBe('/');
    });

    it('should set refresh token when provided', () => {
      const accessToken = 'test-access-token';
      const refreshToken = 'test-refresh-token';

      setAuthCookies(mockRes as Response, accessToken, refreshToken);

      const refreshCall = cookieCalls.find((c) => c.name === 'refresh_token');
      expect(refreshCall).toBeDefined();
      expect(refreshCall!.value).toBe(refreshToken);
      expect(refreshCall!.options.httpOnly).toBe(true);
      expect(refreshCall!.options.sameSite).toBe('lax');
      expect(refreshCall!.options.path).toBe('/auth');
    });

    it('should not set refresh token when not provided', () => {
      const accessToken = 'test-access-token';

      setAuthCookies(mockRes as Response, accessToken);

      const refreshCall = cookieCalls.find((c) => c.name === 'refresh_token');
      expect(refreshCall).toBeUndefined();
      expect(cookieCalls).toHaveLength(1);
      expect(cookieCalls[0].name).toBe('access_token');
    });

    it('should use correct maxAge for access token (15m)', () => {
      const accessToken = 'test-access-token';

      setAuthCookies(mockRes as Response, accessToken);

      const accessCall = cookieCalls.find((c) => c.name === 'access_token');
      // 15 minutes = 900000 ms
      expect(accessCall!.options.maxAge).toBe(15 * 60 * 1000);
    });

    it('should use correct maxAge for refresh token (7d)', () => {
      const accessToken = 'test-access-token';
      const refreshToken = 'test-refresh-token';

      setAuthCookies(mockRes as Response, accessToken, refreshToken);

      const refreshCall = cookieCalls.find((c) => c.name === 'refresh_token');
      // 7 days = 7 * 24 * 60 * 60 * 1000 ms
      expect(refreshCall!.options.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should include domain when COOKIE_DOMAIN is set', async () => {
      jest.resetModules();
      process.env.COOKIE_DOMAIN = '.example.com';

      const { setAuthCookies: setWithDomain } = await import('../../../src/utils/cookies');

      const accessToken = 'test-access-token';

      setWithDomain(mockRes as Response, accessToken);

      const accessCall = cookieCalls.find((c) => c.name === 'access_token');
      expect(accessCall!.options.domain).toBe('.example.com');

      delete process.env.COOKIE_DOMAIN;
      jest.resetModules();
    });

    it('should be secure=true in production environment', async () => {
      jest.resetModules();
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const { setAuthCookies: setWithSecure } = await import('../../../src/utils/cookies');

      // Create new mock response for this test
      const prodMockRes: Partial<Response> = {
        cookie: (jest.fn() as any).mockImplementation((name: string, value: string, options: CookieOptions): Response => {
          cookieCalls.push({ name, value, options });
          return prodMockRes as Response;
        }),
      };

      const accessToken = 'test-access-token';

      setWithSecure(prodMockRes as Response, accessToken);

      const accessCall = cookieCalls.find((c) => c.name === 'access_token');
      expect(accessCall!.options.secure).toBe(true);

      // Restore
      process.env.NODE_ENV = originalEnv;
      jest.resetModules();
    });
  });

  describe('clearAuthCookies', () => {
    let mockRes: Partial<Response>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let clearCookieCalls: Array<{ name: string; options: any }>;

    beforeEach(() => {
      clearCookieCalls = [];
      mockRes = {
        clearCookie: (jest.fn() as any).mockImplementation((name: string, options: CookieOptions): Response => {
          clearCookieCalls.push({ name, options });
          return mockRes as Response;
        }),
      };
    });

    it('should clear both access and refresh cookies', () => {
      clearAuthCookies(mockRes as Response);

      expect(mockRes.clearCookie).toHaveBeenCalledTimes(2);

      const clearedNames = clearCookieCalls.map((c) => c.name);
      expect(clearedNames).toContain('access_token');
      expect(clearedNames).toContain('refresh_token');
    });

    it('should clear access token with correct options', () => {
      clearAuthCookies(mockRes as Response);

      const accessCall = clearCookieCalls.find((c) => c.name === 'access_token');
      expect(accessCall).toBeDefined();
      expect(accessCall!.options).toEqual(expect.objectContaining({
        httpOnly: true,
        secure: false, // false in test environment
        sameSite: 'lax',
        path: '/',
      }));
    });

    it('should clear refresh token with correct options', () => {
      clearAuthCookies(mockRes as Response);

      const refreshCall = clearCookieCalls.find((c) => c.name === 'refresh_token');
      expect(refreshCall).toBeDefined();
      expect(refreshCall!.options).toEqual(expect.objectContaining({
        httpOnly: true,
        secure: false, // false in test environment
        sameSite: 'lax',
        path: '/auth',
      }));
    });

    it('should include domain when COOKIE_DOMAIN is set', async () => {
      jest.resetModules();
      const originalDomain = process.env.COOKIE_DOMAIN;
      process.env.COOKIE_DOMAIN = '.example.com';

      const { clearAuthCookies: clearWithDomain } = await import('../../../src/utils/cookies');

      clearWithDomain(mockRes as Response);

      const accessCall = clearCookieCalls.find((c) => c.name === 'access_token');
      expect(accessCall!.options.domain).toBe('.example.com');

      process.env.COOKIE_DOMAIN = originalDomain;
      jest.resetModules();
    });
  });

  describe('parseDurationMs (shared utility)', () => {
    it('should parse seconds format correctly', () => {
      const result = parseDurationMs('30s', 'TEST_EXPIRY');
      expect(result).toBe(30 * 1000);
    });

    it('should parse minutes format correctly', () => {
      const result = parseDurationMs('15m', 'TEST_EXPIRY');
      expect(result).toBe(15 * 60 * 1000);
    });

    it('should parse hours format correctly', () => {
      const result = parseDurationMs('2h', 'TEST_EXPIRY');
      expect(result).toBe(2 * 60 * 60 * 1000);
    });

    it('should parse days format correctly', () => {
      const result = parseDurationMs('7d', 'TEST_EXPIRY');
      expect(result).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should parse weeks format correctly', () => {
      const result = parseDurationMs('2w', 'TEST_EXPIRY');
      expect(result).toBe(2 * 7 * 24 * 60 * 60 * 1000);
    });

    it('should throw error for invalid format', () => {
      expect(() => parseDurationMs('invalid', 'TEST_EXPIRY')).toThrow('Invalid duration format (TEST_EXPIRY)');
    });

    it('should throw error for missing unit', () => {
      expect(() => parseDurationMs('15', 'TEST_EXPIRY')).toThrow('Invalid duration format (TEST_EXPIRY)');
    });

    it('should throw error for invalid unit', () => {
      expect(() => parseDurationMs('15x', 'TEST_EXPIRY')).toThrow('Invalid duration format (TEST_EXPIRY)');
    });

    it('should throw error for malformed input', () => {
      expect(() => parseDurationMs('abc', 'TEST_EXPIRY')).toThrow('Invalid duration format (TEST_EXPIRY)');
    });

    it('should parse large values correctly', () => {
      const result = parseDurationMs('365d', 'TEST_EXPIRY');
      expect(result).toBe(365 * 24 * 60 * 60 * 1000);
    });

    it('should parse single digit values', () => {
      const result = parseDurationMs('1m', 'TEST_EXPIRY');
      expect(result).toBe(60 * 1000);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete auth flow', () => {
      const setCookieCalls: Array<{ name: string; value: string }> = [];
      const clearCookieCalls: string[] = [];

      const mockRes: Partial<Response> = {
        cookie: (jest.fn() as any).mockImplementation((name: string, value: string): Response => {
          setCookieCalls.push({ name, value });
          return mockRes as Response;
        }),
        clearCookie: (jest.fn() as any).mockImplementation((name: string): Response => {
          clearCookieCalls.push(name);
          return mockRes as Response;
        }),
      };

      // Set auth cookies
      setAuthCookies(mockRes as Response, 'access-token', 'refresh-token');

      expect(setCookieCalls).toHaveLength(2);
      expect(setCookieCalls[0].name).toBe('access_token');
      expect(setCookieCalls[1].name).toBe('refresh_token');

      // Clear auth cookies
      clearCookieCalls.length = 0;
      clearAuthCookies(mockRes as Response);

      expect(clearCookieCalls).toHaveLength(2);
      expect(clearCookieCalls).toContain('access_token');
      expect(clearCookieCalls).toContain('refresh_token');
    });

    it('should handle login without refresh token', () => {
      const cookieCalls: Array<{ name: string; value: string }> = [];

      const mockRes: Partial<Response> = {
        cookie: (jest.fn() as any).mockImplementation((name: string, value: string): Response => {
          cookieCalls.push({ name, value });
          return mockRes as Response;
        }),
      };

      // Set only access token (e.g., token refresh scenario)
      setAuthCookies(mockRes as Response, 'new-access-token');

      expect(cookieCalls).toHaveLength(1);
      expect(cookieCalls[0].name).toBe('access_token');
      expect(cookieCalls[0].value).toBe('new-access-token');
    });
  });

  describe('security considerations', () => {
    it('should always set httpOnly to true for access token', () => {
      const mockRes: Partial<Response> = {
        cookie: jest.fn().mockReturnThis() as any,
      };

      setAuthCookies(mockRes as Response, 'token');

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        'token',
        expect.objectContaining({ httpOnly: true })
      );
    });

    it('should always set httpOnly to true for refresh token', () => {
      const mockRes: Partial<Response> = {
        cookie: jest.fn().mockReturnThis() as any,
      };

      setAuthCookies(mockRes as Response, 'access', 'refresh');

      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh',
        expect.objectContaining({ httpOnly: true })
      );
    });

    it('should always set sameSite to lax', () => {
      const mockRes: Partial<Response> = {
        cookie: jest.fn().mockReturnThis() as any,
      };

      setAuthCookies(mockRes as Response, 'access', 'refresh');

      const calls = (mockRes.cookie as jest.Mock).mock.calls;

      // Both cookies should have sameSite: 'lax'
      calls.forEach((call) => {
        expect(call[2]).toHaveProperty('sameSite', 'lax');
      });
    });

    it('should protect against array injection in getAccessTokenFromCookies', () => {
      const maliciousCookies = {
        access_token: ['token1', 'token2'],
      };

      const result = getAccessTokenFromCookies(maliciousCookies);

      // Should return undefined instead of the array
      expect(result).toBeUndefined();
      expect(typeof result).not.toBe('object');
    });

    it('should protect against array injection in getRefreshTokenFromCookies', () => {
      const maliciousCookies = {
        refresh_token: ['token1', 'token2'],
      };

      const result = getRefreshTokenFromCookies(maliciousCookies);

      // Should return undefined instead of the array
      expect(result).toBeUndefined();
      expect(typeof result).not.toBe('object');
    });
  });
});
