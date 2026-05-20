/**
 * Tier configuration for Free / Pro monetization limits.
 *
 * Reads limit constants from environment variables (see .env.example).
 * Pro users (identified by the TIER_PRO_ROLE in their roles array)
 * have all limits set to Infinity.
 */

/** Role string that identifies a Pro user. */
export const TIER_PRO_ROLE = process.env.TIER_PRO_ROLE || 'pro';

/** Role string that identifies a Super (admin/dev) user. */
export const TIER_SUPER_ROLE = process.env.TIER_SUPER_ROLE || 'super';

/** Allowed plan size strings for free tier. */
const FREE_ALLOWED_PLAN_SIZES: readonly string[] = (
  process.env.FREE_ALLOWED_PLAN_SIZES || 'basic,moderate'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** All plan sizes available to Pro users. */
const ALL_PLAN_SIZES: readonly string[] = ['basic', 'moderate', 'large', 'dynamic'];

export interface TierLimits {
  /** Maximum number of active plans. `Infinity` means unlimited. */
  readonly maxActivePlans: number;
  /** Allowed plan_size values. */
  readonly allowedPlanSizes: readonly string[];
  /** Daily LLM-graded attempt limit. `Infinity` means unlimited. */
  readonly dailyLlmAttempts: number;
  /** Maximum exam starts per node. `Infinity` means unlimited. */
  readonly maxExamsPerNode: number;
  /** Allowed exercise regenerations per node. `0` means none, `Infinity` means unlimited. */
  readonly exerciseRegenerations: number;
  /** Plan history retention in days. `null` means permanent. */
  readonly planHistoryDays: number | null;
}

export type Tier = 'free' | 'pro' | 'super';

const FREE_LIMITS: TierLimits = {
  maxActivePlans: parseInt(process.env.FREE_MAX_ACTIVE_PLANS || '3', 10) || 3,
  allowedPlanSizes: FREE_ALLOWED_PLAN_SIZES,
  dailyLlmAttempts: parseInt(process.env.FREE_DAILY_LLM_ATTEMPTS || '15', 10) || 15,
  maxExamsPerNode: parseInt(process.env.FREE_MAX_EXAMS_PER_NODE || '2', 10) || 2,
  // Handle NaN by defaulting to 0 (no regenerations for free tier)
  exerciseRegenerations: Number.isNaN(parseInt(process.env.FREE_EXERCISE_REGENERATIONS || '0', 10))
    ? 0
    : parseInt(process.env.FREE_EXERCISE_REGENERATIONS || '0', 10),
  planHistoryDays: parseInt(process.env.FREE_PLAN_HISTORY_DAYS || '30', 10) || 30,
};

const PRO_LIMITS: TierLimits = {
  maxActivePlans: Infinity,
  allowedPlanSizes: ALL_PLAN_SIZES,
  dailyLlmAttempts: Infinity,
  maxExamsPerNode: Infinity,
  exerciseRegenerations: Infinity,
  planHistoryDays: null,
};

const SUPER_LIMITS: TierLimits = {
  maxActivePlans: Infinity,
  allowedPlanSizes: ALL_PLAN_SIZES,
  dailyLlmAttempts: Infinity,
  maxExamsPerNode: Infinity,
  exerciseRegenerations: Infinity,
  planHistoryDays: null,
};

/**
 * Determine the tier for a user based on their roles.
 * Priority: super > pro > free.
 */
export function getTierForUser(roles: string[]): Tier {
  if (roles.includes(TIER_SUPER_ROLE)) return 'super';
  if (roles.includes(TIER_PRO_ROLE)) return 'pro';
  return 'free';
}

/**
 * Get the full limits object for a user based on their roles.
 */
export function getLimitsForUser(roles: string[]): TierLimits {
  const tier = getTierForUser(roles);
  if (tier === 'super') return SUPER_LIMITS;
  if (tier === 'pro') return PRO_LIMITS;
  return FREE_LIMITS;
}
