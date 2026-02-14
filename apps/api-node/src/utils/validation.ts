/**
 * Validation utilities for the Node orchestrator API.
 */

/**
 * UUID v4 regex pattern.
 * Matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * User ID regex pattern.
 * Matches alphanumeric strings with optional hyphens/underscores (for Google OAuth IDs).
 * Length must be between 1 and 255 characters (matching VARCHAR(255) DB column).
 */
const USER_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Check if a string is a valid UUID v4 format.
 *
 * @param value - The string to validate
 * @returns true if the string is a valid UUID format
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Check if a string is a valid user ID.
 * User IDs can be alphanumeric with hyphens or underscores (e.g., Google OAuth numeric IDs).
 * Length must be between 1 and 255 characters (matching VARCHAR(255) DB column).
 *
 * @param value - The string to validate
 * @returns true if the string is a valid user ID format
 */
export function isValidUserId(value: string): boolean {
  return value.length > 0 && value.length <= 255 && USER_ID_REGEX.test(value);
}
