import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-ink text-parchment',
        secondary: 'bg-parchment-dark text-ink border border-gold/30',
        outline: 'border border-gold/50 text-ink bg-transparent',
        // Mastery status variants
        locked: 'bg-locked/20 text-locked border border-locked/30',
        available: 'bg-gold/20 text-gold-muted border border-gold/30 shadow-glow',
        inProgress: 'bg-ocean/20 text-ocean border border-ocean/30',
        mastered: 'bg-forest/20 text-forest border border-forest/30',
        // Difficulty variants
        easy: 'bg-forest/20 text-forest border border-forest/30',
        medium: 'bg-gold/20 text-gold-muted border border-gold/30',
        hard: 'bg-terracotta/20 text-terracotta border border-terracotta/30',
        // Exercise type variants
        mcq: 'bg-ocean/20 text-ocean border border-ocean/30',
        shortAnswer: 'bg-gold/20 text-gold-muted border border-gold/30',
        fillBlank: 'bg-forest/20 text-forest border border-forest/30',
        coding: 'bg-ink/10 text-ink border border-ink/30',
        flashcard: 'bg-terracotta/20 text-terracotta border border-terracotta/30',
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
