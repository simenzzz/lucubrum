/**
 * Mastery threshold constants.
 *
 * These values define the cutoffs for different mastery states
 * and are used consistently across the backend services.
 */

/** Mastery score at or above which a node is considered "mastered". */
export const MASTERY_THRESHOLD = 0.8;

/** Mastery score at or above which a prerequisite is considered "met". */
export const PREREQ_THRESHOLD = 0.6;

/** Maximum mastery score achievable through exercises alone. */
export const EXERCISE_MASTERY_CAP = parseFloat(process.env.EXERCISE_MASTERY_CAP || '0.35');

/** Target number of correct answers for full volume multiplier (sqrt curve). */
export const MASTERY_VOLUME_TARGET = Math.max(1, parseInt(
  process.env.MASTERY_VOLUME_TARGET || '15',
  10
) || 15);
