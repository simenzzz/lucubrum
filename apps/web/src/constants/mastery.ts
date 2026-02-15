/**
 * Mastery threshold constants.
 *
 * These values define the cutoffs for different mastery states
 * and are used consistently across the frontend.
 */

/** Mastery score at or above which a node is considered "mastered". */
export const MASTERY_THRESHOLD = 0.8;

/** Mastery score at or above which a prerequisite is considered "met". */
export const PREREQ_THRESHOLD = 0.6;

/** Maximum mastery score achievable through exercises alone. */
export const EXERCISE_MASTERY_CAP = parseFloat(import.meta.env.VITE_EXERCISE_MASTERY_CAP || '0.35');
