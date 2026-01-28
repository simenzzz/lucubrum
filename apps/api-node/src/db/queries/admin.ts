/**
 * Admin-related database queries.
 */

import { db } from '../client';

/**
 * LLM call log entry.
 */
export interface LLMCallLogEntry {
  call_id: string;
  operation: string;
  provider: string;
  model: string;
  prompt_version: string;
  duration_ms: number;
  status: string;
  validation_errors: unknown | null;
  retry_count: number;
  created_at: string;
  [key: string]: unknown;
}

/**
 * System metrics.
 */
export interface SystemMetrics {
  plans_total: number;
  users_total: number;
  attempts_total: number;
  exercises_total: number;
  llm_calls_total: number;
  llm_calls_last_24h: number;
  avg_llm_duration_ms: number;
  llm_error_rate: number;
  [key: string]: unknown;
}

/**
 * Get paginated LLM call logs.
 */
export async function getLLMCallLogs(
  limit: number = 50,
  offset: number = 0,
  filters?: {
    operation?: string;
    provider?: string;
    status?: string;
    since?: Date;
  }
): Promise<{ logs: LLMCallLogEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.operation) {
    conditions.push(`operation = $${paramIndex++}`);
    params.push(filters.operation);
  }

  if (filters?.provider) {
    conditions.push(`provider = $${paramIndex++}`);
    params.push(filters.provider);
  }

  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  if (filters?.since) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.since.toISOString());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countQuery = `SELECT COUNT(*) as count FROM llm_calls ${whereClause}`;
  const countResult = await db.query<{ count: string }>(countQuery, params);
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  // Get paginated logs
  const logsQuery = `
    SELECT
      call_id,
      operation,
      provider,
      model,
      prompt_version,
      duration_ms,
      status,
      validation_errors,
      retry_count,
      created_at
    FROM llm_calls
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `;

  const logsResult = await db.query<LLMCallLogEntry>(logsQuery, [...params, limit, offset]);

  return {
    logs: logsResult.rows,
    total,
  };
}

/**
 * Get system metrics.
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const metricsQuery = `
    SELECT
      (SELECT COUNT(*) FROM plans)::int as plans_total,
      (SELECT COUNT(*) FROM users)::int as users_total,
      (SELECT COUNT(*) FROM attempts)::int as attempts_total,
      (SELECT COUNT(*) FROM exercises)::int as exercises_total,
      (SELECT COUNT(*) FROM llm_calls)::int as llm_calls_total,
      (SELECT COUNT(*) FROM llm_calls WHERE created_at > NOW() - INTERVAL '24 hours')::int as llm_calls_last_24h,
      COALESCE((SELECT AVG(duration_ms)::int FROM llm_calls WHERE status = 'success'), 0) as avg_llm_duration_ms,
      COALESCE(
        (SELECT
          CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE (COUNT(*) FILTER (WHERE status != 'success'))::float / COUNT(*)
          END
         FROM llm_calls
         WHERE created_at > NOW() - INTERVAL '24 hours'
        ), 0
      ) as llm_error_rate
  `;

  const result = await db.query<SystemMetrics>(metricsQuery, []);

  if (!result.rows[0]) {
    return {
      plans_total: 0,
      users_total: 0,
      attempts_total: 0,
      exercises_total: 0,
      llm_calls_total: 0,
      llm_calls_last_24h: 0,
      avg_llm_duration_ms: 0,
      llm_error_rate: 0,
    };
  }

  return result.rows[0];
}

/**
 * Get distinct operations from LLM calls for filtering.
 */
export async function getLLMOperations(): Promise<string[]> {
  const result = await db.query<{ operation: string }>(
    'SELECT DISTINCT operation FROM llm_calls ORDER BY operation',
    []
  );
  return result.rows.map((row) => row.operation);
}

/**
 * Get distinct providers from LLM calls for filtering.
 */
export async function getLLMProviders(): Promise<string[]> {
  const result = await db.query<{ provider: string }>(
    'SELECT DISTINCT provider FROM llm_calls ORDER BY provider',
    []
  );
  return result.rows.map((row) => row.provider);
}
