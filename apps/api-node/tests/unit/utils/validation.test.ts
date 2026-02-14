/**
 * Validation utility tests
 * Tests for validation.ts: isValidUUID, isValidUserId
 */

import { describe, it, expect } from '@jest/globals';
import { isValidUUID, isValidUserId } from '../../../src/utils/validation';

describe('Validation Utilities', () => {
  describe('isValidUUID', () => {
    it('should accept valid UUID v4 format', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
      expect(isValidUUID('6ba7b811-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should accept valid UUID with uppercase', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('should accept valid UUID with mixed case', () => {
      expect(isValidUUID('550E8400-e29B-41d4-A716-446655440000')).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });

    it('should reject non-UUID strings', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('12345')).toBe(false);
    });

    it('should reject malformed UUIDs', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false); // missing segment
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false); // extra segment
    });

    it('should reject Google OAuth numeric IDs', () => {
      expect(isValidUUID('105201544795521187271')).toBe(false);
    });
  });

  describe('isValidUserId', () => {
    it('should accept alphanumeric strings', () => {
      expect(isValidUserId('abc123')).toBe(true);
      expect(isValidUserId('ABC123')).toBe(true);
      expect(isValidUserId('123456')).toBe(true);
    });

    it('should accept strings with hyphens', () => {
      expect(isValidUserId('user-123')).toBe(true);
      expect(isValidUserId('my-user-id')).toBe(true);
    });

    it('should accept strings with underscores', () => {
      expect(isValidUserId('user_123')).toBe(true);
      expect(isValidUserId('my_user_id')).toBe(true);
    });

    it('should accept strings with mixed hyphens and underscores', () => {
      expect(isValidUserId('user-123_test')).toBe(true);
    });

    it('should accept Google OAuth numeric IDs', () => {
      expect(isValidUserId('105201544795521187271')).toBe(true);
      expect(isValidUserId('123456789')).toBe(true);
    });

    it('should accept valid UUID v4 format', () => {
      expect(isValidUserId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject empty string', () => {
      expect(isValidUserId('')).toBe(false);
    });

    it('should reject strings longer than 255 characters', () => {
      const longId = 'a'.repeat(256);
      expect(isValidUserId(longId)).toBe(false);
    });

    it('should accept strings exactly at 255 character limit', () => {
      const maxId = 'a'.repeat(255);
      expect(isValidUserId(maxId)).toBe(true);
    });

    it('should reject strings with special characters', () => {
      expect(isValidUserId('user@123')).toBe(false);
      expect(isValidUserId('user.123')).toBe(false);
      expect(isValidUserId('user#123')).toBe(false);
      expect(isValidUserId('user 123')).toBe(false);
    });

    it('should reject strings with spaces', () => {
      expect(isValidUserId('user 123')).toBe(false);
      expect(isValidUserId(' user123')).toBe(false);
      expect(isValidUserId('user123 ')).toBe(false);
    });

  });
});
