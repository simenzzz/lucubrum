import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-sm font-semibold',
    'rounded-lg',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-parchment',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-ink text-parchment',
          'hover:bg-ink/90',
          'shadow-md hover:shadow-lg',
          'focus-visible:ring-ink',
        ],
        primary: [
          // Brass button effect - polished metal look
          'text-ink font-semibold',
          'bg-gradient-to-b from-[rgb(218,185,110)] via-[rgb(196,160,82)] to-[rgb(178,134,68)]',
          'border border-[rgb(178,134,68)]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(26,25,21,0.1),0_2px_4px_rgba(26,25,21,0.2)]',
          'hover:bg-gradient-to-b hover:from-[rgb(228,200,130)] hover:via-[rgb(218,185,110)] hover:to-[rgb(196,160,82)]',
          'hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(26,25,21,0.1),0_4px_8px_rgba(26,25,21,0.25),0_0_20px_rgba(196,160,82,0.3)]',
          'active:bg-gradient-to-b active:from-[rgb(178,134,68)] active:via-[rgb(196,160,82)] active:to-[rgb(218,185,110)]',
          'active:shadow-[inset_0_2px_4px_rgba(26,25,21,0.2),0_1px_2px_rgba(26,25,21,0.15)]',
          'focus-visible:ring-gold',
        ],
        secondary: [
          'bg-ocean text-parchment',
          'border border-ocean-deep',
          'shadow-md',
          'hover:bg-ocean-light hover:shadow-lg',
          'focus-visible:ring-ocean',
        ],
        outline: [
          'border-2 border-gold/60 text-ink bg-transparent',
          'hover:border-gold hover:bg-gold/10',
          'shadow-sm hover:shadow-md',
          'focus-visible:ring-gold',
        ],
        ghost: [
          'text-ink bg-transparent',
          'hover:bg-parchment-dark/50',
          'focus-visible:ring-gold',
        ],
        link: [
          'text-gold underline-offset-4',
          'hover:underline hover:text-gold/80',
          'focus-visible:ring-gold',
        ],
        parchment: [
          'bg-parchment-dark/80 text-ink',
          'border border-gold/30',
          'shadow-sm',
          'hover:bg-parchment-dark hover:border-gold/50 hover:shadow-md',
          'focus-visible:ring-gold',
        ],
        destructive: [
          'bg-terracotta text-parchment',
          'border border-terracotta/80',
          'shadow-md',
          'hover:bg-terracotta/90 hover:shadow-lg',
          'focus-visible:ring-terracotta',
        ],
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
