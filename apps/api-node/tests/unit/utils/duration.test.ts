/**
 * Duration parsing utility tests
 * Tests for duration.ts: parseDurationMs, parseDurationSeconds
 */

import { describe, it, expect } from '@jest/globals';
import { parseDurationMs, parseDurationSeconds } from '../../../src/utils/duration';

describe('Duration Utilities', () => {
  describe('parseDurationMs', () => {
    it('should parse seconds', () => {
      expect(parseDurationMs('30s')).toBe(30_000);
    });

    it('should parse minutes', () => {
      expect(parseDurationMs('15m')).toBe(900_000);
    });

    it('should parse hours', () => {
      expect(parseDurationMs('2h')).toBe(7_200_000);
    });

    it('should parse days', () => {
      expect(parseDurationMs('7d')).toBe(604_800_000);
    });

    it('should parse weeks', () => {
      expect(parseDurationMs('2w')).toBe(1_209_600_000);
    });

    it('should parse single-digit values', () => {
      expect(parseDurationMs('1s')).toBe(1_000);
      expect(parseDurationMs('1m')).toBe(60_000);
      expect(parseDurationMs('1h')).toBe(3_600_000);
      expect(parseDurationMs('1d')).toBe(86_400_000);
      expect(parseDurationMs('1w')).toBe(604_800_000);
    });

    it('should parse large values', () => {
      expect(parseDurationMs('365d')).toBe(365 * 24 * 60 * 60 * 1000);
    });

    it('should throw on invalid format with label', () => {
      expect(() => parseDurationMs('invalid', 'MY_VAR')).toThrow(
        'Invalid duration format (MY_VAR): "invalid"'
      );
    });

    it('should throw on invalid format without label', () => {
      expect(() => parseDurationMs('invalid')).toThrow(
        'Invalid duration format: "invalid"'
      );
    });

    it('should throw on missing unit', () => {
      expect(() => parseDurationMs('15')).toThrow('Invalid duration format');
    });

    it('should throw on invalid unit', () => {
      expect(() => parseDurationMs('15x')).toThrow('Invalid duration format');
    });

    it('should throw on empty string', () => {
      expect(() => parseDurationMs('')).toThrow('Invalid duration format');
    });

    it('should throw on negative values', () => {
      expect(() => parseDurationMs('-5m')).toThrow('Invalid duration format');
    });

    it('should throw on decimal values', () => {
      expect(() => parseDurationMs('1.5h')).toThrow('Invalid duration format');
    });
  });

  describe('parseDurationSeconds', () => {
    it('should return seconds for all units', () => {
      expect(parseDurationSeconds('30s')).toBe(30);
      expect(parseDurationSeconds('15m')).toBe(900);
      expect(parseDurationSeconds('2h')).toBe(7_200);
      expect(parseDurationSeconds('7d')).toBe(604_800);
      expect(parseDurationSeconds('2w')).toBe(1_209_600);
    });

    it('should throw on invalid format', () => {
      expect(() => parseDurationSeconds('bad', 'EXPIRY')).toThrow(
        'Invalid duration format (EXPIRY): "bad"'
      );
    });
  });
});
