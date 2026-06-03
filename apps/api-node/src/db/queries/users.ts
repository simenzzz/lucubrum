/**
 * User database operations.
 */

import { db } from '../client';
import logger from '../../utils/logger';
import { DEFAULT_NEW_USER_ROLES } from '../../config/tier.config';

/**
 * User row from database.
 */
export interface UserRow {
  user_id: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  roles: string[];
  created_at: Date;
  last_login_at: Date;
}

/**
 * Input for upserting a user.
 */
export interface UpsertUserInput {
  user_id: string;
  email: string;
  name?: string | null;
  picture_url?: string | null;
}

/**
 * Insert or update a user.
 * On conflict (user_id), updates email, name, picture_url, and last_login_at.
 */
export async function upsertUser(input: UpsertUserInput): Promise<UserRow> {
  const { user_id, email, name, picture_url } = input;

  const result = await db.query(
    `INSERT INTO users (user_id, email, name, picture_url, roles, last_login_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       picture_url = EXCLUDED.picture_url,
       last_login_at = NOW()
     RETURNING user_id, email, name, picture_url, roles, created_at, last_login_at`,
    [user_id, email, name || null, picture_url || null, JSON.stringify(DEFAULT_NEW_USER_ROLES)]
  );

  logger.debug({ user_id, email }, 'User upserted');
  return result.rows[0] as unknown as UserRow;
}

/**
 * Get a user by their ID.
 */
export async function getUserById(userId: string): Promise<UserRow | null> {
  const result = await db.query(
    `SELECT user_id, email, name, picture_url, roles, created_at, last_login_at
     FROM users
     WHERE user_id = $1`,
    [userId]
  );

  return (result.rows[0] as unknown as UserRow) || null;
}

/**
 * Get a user by email address.
 */
export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const result = await db.query(
    `SELECT user_id, email, name, picture_url, roles, created_at, last_login_at
     FROM users
     WHERE email = $1`,
    [email]
  );

  return (result.rows[0] as unknown as UserRow) || null;
}

/**
 * Update the last login timestamp for a user.
 */
export async function updateLastLogin(userId: string): Promise<void> {
  await db.query(
    `UPDATE users SET last_login_at = NOW() WHERE user_id = $1`,
    [userId]
  );
  logger.debug({ userId }, 'Updated user last_login_at');
}

/**
 * Input for creating an email/password user.
 */
export interface CreateEmailUserInput {
  user_id: string;
  email: string;
  name: string;
  password_hash: string;
}

/**
 * Create a new email/password user with a UUID user_id.
 */
export async function createEmailUser(input: CreateEmailUserInput): Promise<UserRow> {
  const { user_id, email, name, password_hash } = input;

  const result = await db.query(
    `INSERT INTO users (user_id, email, name, picture_url, roles, password_hash, email_verified, last_login_at)
     VALUES ($1, $2, $3, NULL, $5::jsonb, $4, false, NOW())
     RETURNING user_id, email, name, picture_url, roles, created_at, last_login_at`,
    [user_id, email, name, password_hash, JSON.stringify(DEFAULT_NEW_USER_ROLES)]
  );

  logger.debug({ user_id, email }, 'Email user created');
  return result.rows[0] as unknown as UserRow;
}

/**
 * Get a user by email including their password_hash (for login verification).
 * Returns null if the user does not exist.
 */
export async function getUserByEmailWithHash(
  email: string
): Promise<(UserRow & { password_hash: string | null }) | null> {
  const result = await db.query(
    `SELECT user_id, email, name, picture_url, roles, created_at, last_login_at, password_hash
     FROM users
     WHERE email = $1`,
    [email]
  );

  return (result.rows[0] as unknown as (UserRow & { password_hash: string | null })) || null;
}
