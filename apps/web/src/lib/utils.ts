import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a duration in seconds to a human-readable string
 */
export function formatSeconds(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Calculate time ago string
 */
export function timeAgo(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const seconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
    }
  }

  return 'just now';
}

/**
 * Get level badge configuration — the single source for user-level colors
 * (PlanConfigForm radio cards, roadmap cards, continue-learning hero).
 */
export const LEVEL_BADGES = {
  beginner: {
    value: 'beginner' as const,
    label: 'Beginner',
    icon: 'seedling',
    color: 'text-sage',
    bgColor: 'bg-sage/10',
    gradient: 'from-sage/80 to-sage',
    description: 'New to this topic, starting with fundamentals',
  },
  intermediate: {
    value: 'intermediate' as const,
    label: 'Intermediate',
    icon: 'layers',
    color: 'text-lavender',
    bgColor: 'bg-lavender/10',
    gradient: 'from-lavender to-lavender/80',
    description: 'Some familiarity, ready to deepen knowledge',
  },
  advanced: {
    value: 'advanced' as const,
    label: 'Advanced',
    icon: 'star',
    color: 'text-amber',
    bgColor: 'bg-amber/10',
    gradient: 'from-amber to-amber/80',
    description: 'Experienced, seeking mastery and nuance',
  },
} as const;

/**
 * Get size badge configuration
 */
export const SIZE_BADGES = {
  basic: {
    value: 'basic' as const,
    label: 'Quick Path',
    icon: 'zap',
    description: 'Essentials only, 4-12 topics',
  },
  moderate: {
    value: 'moderate' as const,
    label: 'Standard Path',
    icon: 'layers',
    description: 'Balanced depth, 12-20 topics',
  },
  large: {
    value: 'large' as const,
    label: 'Deep Dive',
    icon: 'mountain',
    description: 'Comprehensive coverage, 20-30 topics',
  },
} as const;

/**
 * Get a safe error message for display to users.
 * In development, shows the actual error message.
 * In production, shows a generic message to avoid leaking internal details.
 */
export function getSafeErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (import.meta.env.DEV) {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
  }
  return fallback;
}
