import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date as a readable string
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(dateObj);
}

/**
 * Format a duration in minutes to a human-readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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
 * Format a mastery score (0-1) to a percentage
 */
export function formatMastery(mastery: number): string {
  return `${Math.round(mastery * 100)}%`;
}

/**
 * Get mastery status from score
 */
export function getMasteryStatus(
  mastery: number,
  hasAttempted: boolean
): 'locked' | 'available' | 'in_progress' | 'mastered' {
  if (!hasAttempted && mastery === 0) {
    return 'available';
  }
  if (mastery >= 0.8) {
    return 'mastered';
  }
  if (mastery > 0 || hasAttempted) {
    return 'in_progress';
  }
  return 'available';
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
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Generate a color based on mastery score
 */
export function getMasteryColor(mastery: number): string {
  if (mastery >= 0.8) return 'text-sage'; // mastered
  if (mastery >= 0.4) return 'text-amber'; // in progress
  return 'text-lavender'; // available
}

/**
 * Get level badge configuration
 */
export const LEVEL_BADGES = {
  beginner: {
    value: 'beginner' as const,
    label: 'Beginner',
    icon: 'seedling',
    color: 'text-sage',
    bgColor: 'bg-sage/10',
    description: 'New to this topic, starting with fundamentals',
  },
  intermediate: {
    value: 'intermediate' as const,
    label: 'Intermediate',
    icon: 'layers',
    color: 'text-lavender',
    bgColor: 'bg-lavender/10',
    description: 'Some familiarity, ready to deepen knowledge',
  },
  advanced: {
    value: 'advanced' as const,
    label: 'Advanced',
    icon: 'star',
    color: 'text-amber',
    bgColor: 'bg-amber/10',
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
    description: 'Essentials only, 4-6 topics',
  },
  moderate: {
    value: 'moderate' as const,
    label: 'Standard Path',
    icon: 'layers',
    description: 'Balanced depth, 8-12 topics',
  },
  large: {
    value: 'large' as const,
    label: 'Deep Dive',
    icon: 'mountain',
    description: 'Comprehensive coverage, 15-25 topics',
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
