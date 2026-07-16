/**
 * Single source of truth for the node-status visual language
 * (icon + border + chip colors + legend dot) used by the roadmap graph,
 * the landing-page previews, and the graph legend.
 *
 * NOTE: ui/badge.tsx mirrors these colors in its cva variants
 * (locked/available/inProgress/mastered) — cva needs literal strings,
 * so keep the two in sync when changing a status color.
 */
import { Lock, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type NodeStatus = 'locked' | 'available' | 'in_progress' | 'mastered';

export interface NodeStatusVisual {
  icon: LucideIcon;
  label: string;
  /** Card/node border color */
  border: string;
  /** Status icon chip: background + icon color */
  iconBg: string;
  /** Glow shadow for the node card ('' = none) */
  glow: string;
  /** Small legend dot */
  dot: string;
}

export const NODE_STATUS_CONFIG: Record<NodeStatus, NodeStatusVisual> = {
  locked: {
    icon: Lock,
    label: 'Locked',
    border: 'border-locked/30',
    iconBg: 'bg-locked/20 text-locked',
    glow: '',
    dot: 'bg-locked/40 border-locked/60',
  },
  available: {
    icon: Sparkles,
    label: 'Available',
    border: 'border-amber',
    iconBg: 'bg-amber/20 text-amber',
    glow: 'shadow-glow-amber',
    dot: 'bg-amber/30 border-amber',
  },
  in_progress: {
    icon: Loader2,
    label: 'In Progress',
    border: 'border-lavender',
    iconBg: 'bg-lavender/20 text-lavender',
    glow: 'shadow-glow-lavender',
    dot: 'bg-lavender/30 border-lavender',
  },
  mastered: {
    icon: CheckCircle2,
    label: 'Mastered',
    border: 'border-sage',
    iconBg: 'bg-sage/20 text-sage',
    glow: 'shadow-glow-sage',
    dot: 'bg-sage/30 border-sage',
  },
};

/** Mastery score -> text color (thresholds match the Progress primitive's 30/70). */
export function masteryTextColor(mastery: number): string {
  if (mastery >= 0.7) return 'text-sage';
  if (mastery >= 0.3) return 'text-amber';
  return 'text-rose';
}

/** Mastery score -> bar gradient (same thresholds as masteryTextColor). */
export function masteryBarGradient(mastery: number): string {
  if (mastery >= 0.7) return 'bg-gradient-to-r from-sage to-sage-light';
  if (mastery >= 0.3) return 'bg-gradient-to-r from-amber to-amber-light';
  return 'bg-gradient-to-r from-rose to-rose-light';
}
