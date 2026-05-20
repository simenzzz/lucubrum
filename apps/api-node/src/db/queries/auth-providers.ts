/**
 * Auth providers database operations.
 * Maps (provider, provider_user_id) → user_id for multi-provider identity.
 */

import { db } from '../client';
import logger from '../../utils/logger';

export interface AuthProviderInput {
  user_id: string;
  provider: string;           // 'google' | 'facebook' | 'email'
  provider_user_id: string;
}

/**
 * Create an auth provider mapping for a user.
 * Ignores duplicate key errors (idempotent).
 */
export async function createAuthProvider(input: AuthProviderInput): Promise<void> {
  const { user_id, provider, provider_user_id } = input;

  await db.query(
    `INSERT INTO auth_providers (user_id, provider, provider_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, provider_user_id) DO NOTHING`,
    [user_id, provider, provider_user_id]
  );

  logger.debug({ user_id, provider }, 'Auth provider created');
}

/**
 * Find a user_id by provider and provider-specific user ID.
 * Returns null if no mapping exists.
 */
export async function findUserByProvider(
  provider: string,
  providerUserId: string
): Promise<string | null> {
  const result = await db.query(
    `SELECT user_id FROM auth_providers
     WHERE provider = $1 AND provider_user_id = $2`,
    [provider, providerUserId]
  );

  return (result.rows[0]?.user_id as string) || null;
}

/**
 * Get all auth providers for a user.
 */
export async function getProvidersByUserId(
  userId: string
): Promise<Array<{ provider: string; provider_user_id: string }>> {
  const result = await db.query(
    `SELECT provider, provider_user_id FROM auth_providers
     WHERE user_id = $1`,
    [userId]
  );

  return result.rows as Array<{ provider: string; provider_user_id: string }>;
}
