// Mock for google-auth-library
import { jest } from '@jest/globals';

export const OAuth2Client = jest.fn().mockImplementation(() => ({
  verifyIdToken: jest.fn().mockResolvedValue({
    getPayload: () => ({
      sub: 'google-123',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
      picture: 'https://example.com/photo.jpg',
    }),
  }),
  verifySignedJwtWithCertsAsync: jest.fn().mockResolvedValue({
    sub: 'google-123',
    email: 'test@example.com',
    email_verified: true,
    name: 'Test User',
    picture: 'https://example.com/photo.jpg',
  }),
}));

export class VerifyIdTokenOptions {
  constructor(public idToken: string, public audience?: string[]) {}
}
