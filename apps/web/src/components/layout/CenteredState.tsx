/**
 * Shared centered status block (error / empty / info): glowing icon,
 * heading, message, and action buttons. Replaces the many hand-rolled
 * "centered icon + heading + message + button" variants.
 */
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CenteredStateProps {
  icon: LucideIcon;
  /** Icon + glow tint (defaults to the error rose) */
  tone?: 'rose' | 'amber';
  title: string;
  message?: string;
  /** Action buttons (rendered in a centered row) */
  children?: React.ReactNode;
  /** Wrap in a min-h-screen page container */
  fullScreen?: boolean;
  className?: string;
}

const TONE_CLASSES = {
  rose: { glow: 'bg-rose/10', icon: 'text-rose/60' },
  amber: { glow: 'bg-amber/10', icon: 'text-amber/60' },
} as const;

export function CenteredState({
  icon: Icon,
  tone = 'rose',
  title,
  message,
  children,
  fullScreen = false,
  className,
}: CenteredStateProps) {
  const toneClasses = TONE_CLASSES[tone];

  const content = (
    <div className={cn('flex flex-col items-center justify-center text-center', className)}>
      {/* Icon with glow */}
      <div className="relative w-32 h-32 mb-8">
        <div className={cn('absolute inset-0 rounded-full blur-xl', toneClasses.glow)} />
        <div className="relative w-full h-full flex items-center justify-center">
          <Icon className={cn('w-20 h-20', toneClasses.icon)} />
        </div>
      </div>

      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-heading font-bold text-warm-50">{title}</h2>
        {message && <p className="text-warm-200">{message}</p>}
      </div>

      {children && <div className="flex gap-3 mt-8">{children}</div>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-hearth-900 flex items-center justify-center p-4">
        {content}
      </div>
    );
  }

  return content;
}
