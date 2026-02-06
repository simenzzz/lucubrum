// Auth fixtures for testing JWT, OAuth, and authentication flows

import { randomUUID } from 'crypto';
import { sign } from 'jsonwebtoken';

// Environment variables (from setup.ts)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in test environment (check tests/setup.ts)');
}
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export interface MockUser {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  roles: string[];
}

export interface MockTokens {
  accessToken: string;
  refreshToken: string;
  accessJti: string;
  refreshJti: string;
  expiresAt: Date;
}

/**
 * Standard test user
 */
export const mockUser: MockUser = {
  user_id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.jpg',
  roles: ['user'],
};

/**
 * Admin test user
 */
export const mockAdminUser: MockUser = {
  user_id: 'admin-user-123',
  email: 'admin@example.com',
  name: 'Admin User',
  roles: ['user', 'admin'],
};

/**
 * Create a mock user with overrides
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    user_id: randomUUID(),
    email: 'test@example.com',
    name: 'Test User',
    roles: ['user'],
    ...overrides,
  };
}

/**
 * Mock JTI (JWT ID) for testing
 */
export const mockJTI = 'test-jti-12345';

/**
 * Create a mock JTI
 */
export function createMockJTI(): string {
  return randomUUID();
}

/**
 * Generate a valid access token for testing
 */
export function generateValidAccessToken(
  user: MockUser = mockUser,
  jti: string = mockJTI,
  secret: string = JWT_SECRET,
  expiry: string = JWT_ACCESS_EXPIRY
): string {
  const payload = {
    sub: user.user_id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    jti,
    type: 'access',
  };

  return sign(payload, secret, { expiresIn: expiry });
}

/**
 * Generate a valid refresh token for testing
 */
export function generateValidRefreshToken(
  user: MockUser = mockUser,
  jti: string = mockJTI,
  secret: string = JWT_SECRET,
  expiry: string = JWT_REFRESH_EXPIRY
): string {
  const payload = {
    sub: user.user_id,
    jti,
    type: 'refresh',
  };

  return sign(payload, secret, { expiresIn: expiry });
}

/**
 * Generate a complete token pair
 */
export function generateTokenPair(
  user: MockUser = mockUser,
  secret: string = JWT_SECRET
): MockTokens {
  const accessJti = createMockJTI();
  const refreshJti = createMockJTI();
  const accessToken = generateValidAccessToken(user, accessJti, secret);
  const refreshToken = generateValidRefreshToken(user, refreshJti, secret);

  // Calculate expiry date (15 minutes from now for access token)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15);

  return {
    accessToken,
    refreshToken,
    accessJti,
    refreshJti,
    expiresAt,
  };
}

/**
 * Generate an expired access token
 */
export function generateExpiredAccessToken(user: MockUser = mockUser, jti: string = 'expired-jti'): string {
  // Token that expired 1 hour ago
  return sign(
    {
      sub: user.user_id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      jti,
      type: 'access',
    },
    JWT_SECRET,
    { expiresIn: '-1h' }
  );
}

/**
 * Generate a malformed token (invalid JWT structure)
 */
export const malformedToken = 'not.a.valid.jwt.token';

/**
 * Generate a token signed with wrong secret
 */
export function generateTokenWithWrongSecret(user: MockUser = mockUser): string {
  return sign(
    {
      sub: user.user_id,
      email: user.email,
      roles: user.roles,
      jti: 'wrong-secret-jti',
      type: 'access',
    },
    'wrong-secret-key',
    { expiresIn: '15m' }
  );
}

/**
 * Generate a token with wrong type (refresh instead of access)
 */
export function generateRefreshTokenAsAccess(user: MockUser = mockUser): string {
  return sign(
    {
      sub: user.user_id,
      jti: 'wrong-type-jti',
      type: 'refresh', // Wrong type for access token verification
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Generate a token without required claims
 */
export function generateTokenWithoutClaims(): string {
  return sign({ foo: 'bar' }, JWT_SECRET, { expiresIn: '15m' });
}

/**
 * Mock JWT payload for verification tests
 */
export const mockValidPayload = {
  sub: mockUser.user_id,
  email: mockUser.email,
  name: mockUser.name,
  roles: mockUser.roles,
  jti: mockJTI,
  type: 'access',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
};

/**
 * Mock blacklisted JTIs for testing
 */
export const blacklistedJTIs = [mockJTI, 'blacklisted-jti-1', 'blacklisted-jti-2'];

/**
 * Mock Google OAuth ticket
 */
export const mockGoogleTicket = {
  getUserId: () => mockUser.user_id,
  getEmail: () => mockUser.email,
  getName: () => mockUser.name,
  getPicture: () => mockUser.picture,
};

/**
 * Mock Google OAuth login response
 */
export const mockGoogleLoginResponse = {
  code: 'test-google-auth-code',
  redirect_uri: 'http://localhost:3000/auth/google/callback',
};

/**
 * Helper to create a cookie string from tokens
 */
export function createCookieString(tokens: MockTokens): string {
  return `access_token=${tokens.accessToken}; refresh_token=${tokens.refreshToken}`;
}

/**
 * Helper to parse a JWT without verification (for testing payload inspection)
 */
export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Pre-defined test scenarios with tokens
 */
export const tokenScenarios = {
  validAccess: generateValidAccessToken(),
  validRefresh: generateValidRefreshToken(),
  expiredAccess: generateExpiredAccessToken(),
  malformed: malformedToken,
  wrongSecret: generateTokenWithWrongSecret(),
  wrongType: generateRefreshTokenAsAccess(),
  missingClaims: generateTokenWithoutClaims(),
};
