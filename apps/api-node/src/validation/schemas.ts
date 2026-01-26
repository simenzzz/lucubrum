/**
 * Zod validation schemas for public API input validation.
 *
 * These schemas validate user input at the Node API boundary.
 * Python response validation uses AJV with JSON schemas from packages/contracts/.
 */

import { z } from 'zod';

/**
 * Plan size options that determine the number of nodes.
 * - basic: 4-12 nodes (quick overview)
 * - moderate: 12-20 nodes (standard depth)
 * - large: 20-30 nodes (comprehensive)
 * - dynamic: 4-30 nodes (LLM decides based on topic complexity)
 */
export const PlanSizeSchema = z.enum(['basic', 'moderate', 'large', 'dynamic']);
export type PlanSize = z.infer<typeof PlanSizeSchema>;

/**
 * User level for learning plan difficulty.
 */
export const UserLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type UserLevel = z.infer<typeof UserLevelSchema>;

/**
 * Exercise type options.
 */
export const ExerciseTypeSchema = z.enum([
  'mcq',
  'short_answer',
  'fill_blank',
  'coding',
  'flashcard',
]);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

/**
 * Request schema for creating a new learning plan.
 * POST /api/plan
 */
export const CreatePlanRequestSchema = z.object({
  topic: z
    .string()
    .min(3, 'Topic must be at least 3 characters')
    .max(100, 'Topic must be at most 100 characters'),
  user_level: UserLevelSchema,
  plan_size: PlanSizeSchema.default('moderate'),
  exercise_types: z.array(ExerciseTypeSchema).optional(),
  constraints: z
    .object({
      time_budget_hours: z.number().int().positive().optional(),
    })
    .optional(),
});
export type CreatePlanRequest = z.infer<typeof CreatePlanRequestSchema>;

/**
 * Request schema for generating exercises.
 * POST /api/plan/:planId/nodes/:nodeId/exercises
 */
export const CreateExercisesRequestSchema = z.object({
  exercise_types: z.array(ExerciseTypeSchema).optional(),
  count: z.number().int().min(1).max(20).default(5),
});
export type CreateExercisesRequest = z.infer<typeof CreateExercisesRequestSchema>;

/**
 * Request schema for submitting an attempt.
 * POST /api/attempts
 */
export const SubmitAttemptRequestSchema = z.object({
  plan_id: z.string().uuid(),
  node_id: z
    .string()
    .regex(/^[a-z0-9_]{3,100}$/, 'Invalid node_id format'),
  exercise_id: z.string(),
  user_answer: z.union([z.string(), z.record(z.unknown())]),
});
export type SubmitAttemptRequest = z.infer<typeof SubmitAttemptRequestSchema>;

/**
 * Helper to get node count range for a plan size.
 */
export const PLAN_SIZE_RANGES: Record<PlanSize, { min: number; max: number }> = {
  basic: { min: 4, max: 12 },
  moderate: { min: 12, max: 20 },
  large: { min: 20, max: 30 },
  dynamic: { min: 4, max: 30 },
};

/**
 * Get the node count range for a given plan size.
 */
export function getNodeCountRange(planSize: PlanSize): { min: number; max: number } {
  return PLAN_SIZE_RANGES[planSize];
}

// ==================== Auth Schemas ====================

/**
 * Request schema for OAuth callback.
 * POST /auth/callback
 */
export const OAuthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
});
export type OAuthCallbackRequest = z.infer<typeof OAuthCallbackSchema>;

/**
 * Request schema for refreshing access token.
 * POST /auth/refresh
 */
export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenSchema>;

/**
 * Request schema for logout.
 * POST /auth/logout
 */
export const LogoutSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});
