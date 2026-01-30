/**
 * Database queries for staleness policies management.
 */

import { db } from '../client';

export interface StalenessPolicy {
  id: number;
  domain_category: string;
  policy_value: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  [key: string]: unknown; // Index signature for db.query generic compatibility
}

export interface CreateStalenessPolicyInput {
  domain_category: string;
  policy_value: string;
  description?: string;
}

export interface UpdateStalenessPolicyInput {
  domain_category?: string;
  policy_value?: string;
  description?: string;
  is_active?: boolean;
}

/**
 * Get all active staleness policies.
 */
export async function getAllStalenessPolicies(): Promise<StalenessPolicy[]> {
  const query = `
    SELECT id, domain_category, policy_value, description, is_active, created_at, updated_at
    FROM staleness_policies
    WHERE is_active = true
    ORDER BY domain_category
  `;
  const result = await db.query<StalenessPolicy>(query);
  return result.rows;
}

/**
 * Get a staleness policy by ID.
 */
export async function getStalenessPolicyById(id: number): Promise<StalenessPolicy | null> {
  const query = `
    SELECT id, domain_category, policy_value, description, is_active, created_at, updated_at
    FROM staleness_policies
    WHERE id = $1
  `;
  const result = await db.query<StalenessPolicy>(query, [id]);
  return result.rows[0] || null;
}

/**
 * Create a new staleness policy.
 */
export async function createStalenessPolicy(
  input: CreateStalenessPolicyInput
): Promise<StalenessPolicy> {
  const query = `
    INSERT INTO staleness_policies (domain_category, policy_value, description)
    VALUES ($1, $2, $3)
    RETURNING id, domain_category, policy_value, description, is_active, created_at, updated_at
  `;
  const values = [input.domain_category, input.policy_value, input.description || null];
  const result = await db.query<StalenessPolicy>(query, values);
  return result.rows[0];
}

/**
 * Update a staleness policy.
 */
export async function updateStalenessPolicy(
  id: number,
  input: UpdateStalenessPolicyInput
): Promise<StalenessPolicy | null> {
  const updates: string[] = [];
  const values: (string | boolean | number)[] = [];
  let paramIndex = 1;

  if (input.domain_category !== undefined) {
    updates.push(`domain_category = $${paramIndex++}`);
    values.push(input.domain_category);
  }
  if (input.policy_value !== undefined) {
    updates.push(`policy_value = $${paramIndex++}`);
    values.push(input.policy_value);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(input.is_active);
  }

  if (updates.length === 0) {
    return getStalenessPolicyById(id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const query = `
    UPDATE staleness_policies
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, domain_category, policy_value, description, is_active, created_at, updated_at
  `;

  const result = await db.query<StalenessPolicy>(query, values);
  return result.rows[0] || null;
}

/**
 * Deactivate (soft delete) a staleness policy.
 */
export async function deactivateStalenessPolicy(id: number): Promise<boolean> {
  const query = `
    UPDATE staleness_policies
    SET is_active = false, updated_at = NOW()
    WHERE id = $1
  `;
  const result = await db.query(query, [id]);
  return (result.rowCount || 0) > 0;
}

/**
 * Delete a staleness policy permanently.
 */
export async function deleteStalenessPolicy(id: number): Promise<boolean> {
  const query = 'DELETE FROM staleness_policies WHERE id = $1';
  const result = await db.query(query, [id]);
  return (result.rowCount || 0) > 0;
}
