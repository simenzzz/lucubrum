/**
 * Zod schemas for runtime API response validation
 * These schemas validate API responses to catch malformed data early
 */
import { z } from 'zod';

// User schema - matches API types exactly
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  picture: z.string().optional(),
  roles: z.array(z.string()),
  created_at: z.string(),
});

export type User = z.infer<typeof UserSchema>;

// Auth response schemas
export const GoogleAuthResponseSchema = z.object({
  authorization_url: z.string().url(),
  state: z.string(),
});

export const AuthCallbackResponseSchema = z.object({
  user: UserSchema,
  authenticated: z.boolean(),
});

// Plan schemas — aligned with Pydantic contract (source of truth)
export const PlanNodeSchema = z.object({
  node_id: z.string(),
  title: z.string(),
  objectives: z.array(z.string()),
  estimated_minutes: z.number(),
  prerequisites: z.array(z.string()),
  tags: z.array(z.string()).nullable().optional(),
});

export const ScheduleItemSchema = z.object({
  node_id: z.string(),
  order: z.number(),
});

export const ArtifactMetadataSchema = z.object({
  request_id: z.string(),
  prompt_version: z.string(),
  provider: z.string(),
  model: z.string(),
  created_at: z.string(),
  raw_output_hash: z.string(),
  artifact_hash: z.string(),
  validation_retry_count: z.number(),
});

export const PlanSchema = z.object({
  schema_version: z.string().optional(),
  topic: z.string(),
  user_level: z.string(),
  plan_size: z.string().optional(),
  nodes: z.array(PlanNodeSchema),
  schedule: z.array(ScheduleItemSchema),
  metadata: ArtifactMetadataSchema,
});

// POST /api/plan returns { plan_id, plan: {...} } — validate nested, transform to flat
export const CreatePlanResponseSchema = z.object({
  plan_id: z.string(),
  plan: PlanSchema,
}).transform((data) => ({
  plan_id: data.plan_id,
  ...data.plan,
}));

// GET /api/plan/:planId returns { plan: {...} } — no plan_id in wrapper
export const GetPlanResponseSchema = z.object({
  plan: PlanSchema,
});

// YouTube Resource schemas (frontend shape after transformation)
export const YouTubeResourceSchema = z.object({
  video_id: z.string(),
  title: z.string(),
  channel: z.string(),
  duration_seconds: z.number(),
  thumbnail_url: z.string(),
  relevance_score: z.number(),
  url: z.string().optional(),
  type: z.enum(['must_watch', 'recommended']).optional(),
  rationale: z.string().optional(),
});

export const NodeResourcesSchema = z.object({
  node_id: z.string(),
  resources: z.array(YouTubeResourceSchema),
});

// Backend resource response schema (camelCase from Node API)
export const BackendSelectedResourceSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  channelTitle: z.string(),
  url: z.string(),
  durationSeconds: z.number(),
  rankScore: z.number(),
  type: z.enum(['must_watch', 'recommended']),
  rationale: z.string(),
});

export const BackendResourcesResponseSchema = z.object({
  resources_by_node: z.record(z.string(), z.array(BackendSelectedResourceSchema)),
  skipped_nodes: z.array(z.string()).optional(),
});

// Exercise schemas — aligned with Python/DB field names (source of truth)
const BaseExerciseSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  rubric: z.string().optional(),
});

export const MCQExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('mcq'),
  choices: z.array(z.string()),
  correct_answer: z.string(),
});

export const ShortAnswerExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('short_answer'),
  correct_answer: z.string(),
});

export const FillBlankExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('fill_blank'),
  correct_answer: z.object({
    answers: z.array(z.string()),
    match: z.enum(['case_sensitive', 'case_insensitive']),
    normalize_whitespace: z.boolean(),
  }),
});

export const CodingExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('coding'),
  correct_answer: z.object({
    language: z.string(),
    solution: z.string(),
    test_cases: z.array(
      z.record(z.any()).transform((obj): { input: unknown; output: unknown } => ({
        input: obj.input,
        output: obj.output,
      }))
    ),
  }),
});

export const FlashcardExerciseSchema = BaseExerciseSchema.extend({
  type: z.literal('flashcard'),
  correct_answer: z.string(),
});

export const ExerciseSchema = z.discriminatedUnion('type', [
  MCQExerciseSchema,
  ShortAnswerExerciseSchema,
  FillBlankExerciseSchema,
  CodingExerciseSchema,
  FlashcardExerciseSchema,
]);

export const ExerciseSetResponseSchema = z.object({
  node_id: z.string(),
  exercises: z.array(ExerciseSchema),
  cached: z.boolean().optional(),
});

// Mastery schemas
export const AttemptResponseSchema = z.object({
  attempt_id: z.string(),
  exercise_id: z.string(),
  is_correct: z.boolean(),
  score: z.number(),
  feedback: z.string(),
  misconceptions: z.array(z.string()).optional(),
  mastery_before: z.number(),
  mastery_after: z.number(),
});

export const NodeMasteryResponseSchema = z.object({
  node_id: z.string(),
  mastery: z.number(),
  attempt_count: z.number(),
  last_attempt_at: z.string().optional(),
  next_review_at: z.string().optional(),
});

export const PlanMasteryOverviewResponseSchema = z.object({
  plan_id: z.string(),
  node_masteries: z.array(
    z.object({
      node_id: z.string(),
      mastery: z.number(),
      status: z.enum(['locked', 'available', 'in_progress', 'mastered']),
    })
  ),
  overall_mastery: z.number(),
  completed_nodes: z.number(),
  total_nodes: z.number(),
});

// User plans schemas
export const UserPlanSummarySchema = z.object({
  plan_id: z.string(),
  topic: z.string(),
  user_level: z.string(),
  mastery: z.number(),
  node_count: z.number(),
  completed_nodes: z.number(),
  last_accessed_at: z.string(),
  created_at: z.string(),
});

export const UserPlansResponseSchema = z.object({
  plans: z.array(UserPlanSummarySchema),
  total: z.number(),
});

// Error schema
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  timestamp: z.string(),
});

// Request validation schemas
export const CreatePlanRequestSchema = z.object({
  topic: z.string()
    .min(3, 'Topic must be at least 3 characters')
    .max(200, 'Topic must be at most 200 characters')
    .trim(),
  user_level: z.enum(['beginner', 'intermediate', 'advanced']),
  plan_size: z.enum(['basic', 'moderate', 'large', 'dynamic']).optional(),
});

/**
 * Safe parse helper that logs validation errors in development
 */
export function safeParseWithLogging<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  data: unknown,
  context: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[API Validation Error] ${context}:`, result.error.format());
    throw new Error(`Invalid API response for ${context}`);
  }
  return result.data;
}
