/**
 * User database operations.
 */

import { db } from '../client';
import logger from '../../utils/logger';

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
     VALUES ($1, $2, $3, $4, '["user"]'::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       picture_url = EXCLUDED.picture_url,
       last_login_at = NOW()
     RETURNING user_id, email, name, picture_url, roles, created_at, last_login_at`,
    [user_id, email, name || null, picture_url || null]
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
