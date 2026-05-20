/**
 * Refresh token database operations with SHA-256 hashing.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../client';
import logger from '../../utils/logger';

/**
 * Refresh token row from database.
 */
export interface RefreshTokenRow {
  token_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

/**
 * Input for creating a refresh token.
 */
export interface CreateRefreshTokenInput {
  user_id: string;
  token_hash: string;
  expires_at: Date;
}

/**
 * Hash a token using SHA-256.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Store a new refresh token hash.
 */
export async function createRefreshToken(input: CreateRefreshTokenInput): Promise<void> {
  const { user_id, token_hash, expires_at } = input;
  const tokenId = uuidv4();

  await db.query(
    `INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenId, user_id, token_hash, expires_at]
  );

  logger.debug({ user_id }, 'Refresh token created');
}

/**
 * Get a refresh token by its hash.
 * Returns null if not found.
 */
export async function getRefreshTokenByHash(
  tokenHash: string
): Promise<RefreshTokenRow | null> {
  const result = await db.query(
    `SELECT token_id, user_id, token_hash, expires_at, revoked_at, created_at
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );

  return (result.rows[0] as unknown as RefreshTokenRow) || null;
}

/**
 * Revoke a refresh token by its ID.
 * Returns true if a token was revoked, false if not found.
 */
export async function revokeRefreshToken(tokenId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE token_id = $1 AND revoked_at IS NULL`,
    [tokenId]
  );

  const revoked = (result.rowCount ?? 0) > 0;
  if (revoked) {
    logger.debug({ tokenId }, 'Refresh token revoked');
  }
  return revoked;
}

/**
 * Revoke all refresh tokens for a user.
 * Returns the number of tokens revoked.
 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const result = await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.debug({ userId, count }, 'All user refresh tokens revoked');
  }
  return count;
}

/**
 * Clean up expired tokens (for maintenance jobs).
 * Returns the number of tokens deleted.
 */
export async function deleteExpiredTokens(): Promise<number> {
  const result = await db.query(
    `DELETE FROM refresh_tokens
     WHERE (expires_at < NOW())
        OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days')`
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info({ count }, 'Expired tokens cleaned up');
  }
  return count;
}
