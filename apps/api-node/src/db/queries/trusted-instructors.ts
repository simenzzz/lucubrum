/**
 * Trusted Instructors queries — channel reliability scores for video ranking.
 */

import { db } from '../client';

export interface TrustedInstructor {
  channel_id: string;
  channel_name: string;
  reliability_score: number;
  source: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  [key: string]: unknown; // Index signature for db.query generic compatibility
}

/**
 * Get instructor by channel name (case-insensitive).
 */
export async function getInstructorByChannelName(
  channelName: string
): Promise<TrustedInstructor | null> {
  const result = await db.query<TrustedInstructor>(
    `SELECT channel_id, channel_name, reliability_score, source, notes, created_at, updated_at
     FROM trusted_instructors
     WHERE LOWER(channel_name) = LOWER($1)`,
    [channelName]
  );
  return result.rows[0] || null;
}

/**
 * Get multiple instructors by channel names in batch.
 * Returns a Map for efficient lookup (key is lowercase channel name).
 */
export async function getInstructorsByChannelNames(
  channelNames: string[]
): Promise<Map<string, TrustedInstructor>> {
  if (channelNames.length === 0) {
    return new Map();
  }

  const placeholders = channelNames.map((_, i) => `$${i + 1}`).join(', ');
  const lowerNames = channelNames.map((n) => n.toLowerCase());

  const result = await db.query<TrustedInstructor>(
    `SELECT channel_id, channel_name, reliability_score, source, notes, created_at, updated_at
     FROM trusted_instructors
     WHERE LOWER(channel_name) IN (${placeholders})`,
    lowerNames
  );

  const map = new Map<string, TrustedInstructor>();
  for (const row of result.rows) {
    map.set(row.channel_name.toLowerCase(), row);
  }
  return map;
}
