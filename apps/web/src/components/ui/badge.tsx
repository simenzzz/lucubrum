import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber focus:ring-offset-2 focus:ring-offset-hearth-900',
  {
    variants: {
      variant: {
        default: 'bg-hearth-700 text-warm-50 border border-border-moderate',
        secondary: 'bg-hearth-600 text-warm-200 border border-border-moderate',
        outline: 'border border-border-strong text-warm-200 bg-transparent',
        // Mastery status variants
        locked: 'bg-locked/20 text-warm-400 border border-locked/30',
        available: 'bg-amber/15 text-amber border border-amber/30',
        inProgress: 'bg-lavender/15 text-lavender border border-lavender/30',
        mastered: 'bg-sage/15 text-sage border border-sage/30',
        // Exam variant
        examReady: 'bg-amber/20 text-amber border border-amber/40 shadow-glow-amber',
        // Difficulty variants
        easy: 'bg-sage/15 text-sage border border-sage/30',
        medium: 'bg-amber/15 text-amber border border-amber/30',
        hard: 'bg-rose/15 text-rose border border-rose/30',
        // Exercise type variants
        mcq: 'bg-lavender/15 text-lavender border border-lavender/30',
        shortAnswer: 'bg-amber/15 text-amber border border-amber/30',
        fillBlank: 'bg-sage/15 text-sage border border-sage/30',
        coding: 'bg-warm-400/15 text-warm-200 border border-warm-400/30',
        flashcard: 'bg-clay/15 text-clay border border-clay/30',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-px text-[10px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
