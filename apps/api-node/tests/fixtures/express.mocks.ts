// Express mock objects for middleware and route testing

import { type Request, type Response, type NextFunction } from 'express';
import type { CookieOptions } from 'express';

export interface MockRequest {
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
  path?: string;
  user?: {
    user_id: string;
    email: string;
    roles: string[];
    jti?: string;
    exp?: number;
  };
}

export interface MockResponse extends Partial<Response> {
  statusCode?: number;
  jsonData?: unknown;
  _headers?: Record<string, string | string[]>;
}

export interface MockNextFunction {
  next: NextFunction;
  calls: number;
  lastError?: Error;
}

/**
 * Create a mock Express Request object
 */
export function createMockRequest(overrides: MockRequest = {}): MockRequest {
  return {
    cookies: {},
    headers: {},
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

/**
 * Create a mock Express Request with auth cookies
 */
export function createMockRequestWithAuth(
  accessToken: string,
  refreshToken?: string,
  overrides: MockRequest = {}
): MockRequest {
  const cookies: Record<string, string> = {
    access_token: accessToken,
  };
  if (refreshToken) {
    cookies.refresh_token = refreshToken;
  }
  return createMockRequest({
    cookies,
    ...overrides,
  });
}

/**
 * Create a mock Express Request with authenticated user
 */
export function createMockAuthenticatedRequest(
  user: { user_id: string; email: string; roles: string[] },
  overrides: MockRequest = {}
): MockRequest {
  return createMockRequest({
    user,
    ...overrides,
  });
}

/**
 * Create a mock Express Response object with tracking
 */
export function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    jsonData: undefined,
    _headers: {},

    status(this: MockResponse, code: number) {
      this.statusCode = code;
      return this as unknown as Response;
    },

    json(this: MockResponse, data: unknown) {
      this.jsonData = data;
      return this as unknown as Response;
    },

    send(this: MockResponse, data: unknown) {
      this.jsonData = data;
      return this as unknown as Response;
    },

    setHeader(this: MockResponse, name: string, value: string | string[]) {
      if (this._headers) {
        this._headers[name] = value;
      }
      return this as unknown as Response;
    },

    getHeader(this: MockResponse, name: string) {
      return this._headers?.[name];
    },

    cookie(this: MockResponse, name: string, value: string, options?: CookieOptions) {
      if (this._headers) {
        const cookieValue = options
          ? `${name}=${value}; ${Object.entries(options)
              .map(([k, v]) => `${k}=${v}`)
              .join('; ')}`
          : `${name}=${value}`;
        this._headers['set-cookie'] = this._headers['set-cookie']
          ? [...(this._headers['set-cookie'] as string[]), cookieValue]
          : cookieValue;
      }
      return this as unknown as Response;
    },

    clearCookie(this: MockResponse, name: string, options?: CookieOptions) {
      if (this._headers) {
        const cookieValue = options
          ? `${name}=; ${Object.entries(options)
              .map(([k, v]) => `${k}=${v}`)
              .join('; ')}`
          : `${name}=; Max-Age=0`;
        this._headers['set-cookie'] = this._headers['set-cookie']
          ? [...(this._headers['set-cookie'] as string[]), cookieValue]
          : cookieValue;
      }
      return this as unknown as Response;
    },
  };

  return res;
}

/**
 * Create a mock NextFunction that tracks calls and errors
 */
export function createMockNextFunction(): MockNextFunction {
  const mockNext: MockNextFunction = {
    calls: 0,
    lastError: undefined,
    next: ((error?: unknown) => {
      mockNext.calls++;
      if (error instanceof Error) {
        mockNext.lastError = error;
      }
    }) as NextFunction,
  };

  return mockNext;
}

/**
 * Helper to assert response status and data
 */
export function assertResponse(
  res: MockResponse,
  expectedStatusCode: number,
  expectedData?: unknown
): void {
  expect(res.statusCode).toBe(expectedStatusCode);
  if (expectedData !== undefined) {
    expect(res.jsonData).toEqual(expectedData);
  }
}

/**
 * Helper to assert auth cookies are set correctly
 */
export function assertAuthCookiesSet(res: MockResponse): void {
  const setCookieHeaders = res._headers?.['set-cookie'];
  expect(setCookieHeaders).toBeDefined();

  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const cookieStr = cookies.join('; ');

  // Check for access_token
  expect(cookieStr).toContain('access_token=');
  // Check for security options
  expect(cookieStr).toContain('HttpOnly');
  expect(cookieStr).toContain('Secure');
  expect(cookieStr).toContain('SameSite=Strict');
}

/**
 * Helper to assert auth cookies are cleared
 */
export function assertAuthCookiesCleared(res: MockResponse): void {
  const setCookieHeaders = res._headers?.['set-cookie'];
  expect(setCookieHeaders).toBeDefined();

  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const cookieStr = cookies.join('; ');

  // Cleared cookies have Max-Age=0
  expect(cookieStr).toContain('Max-Age=0');
}
