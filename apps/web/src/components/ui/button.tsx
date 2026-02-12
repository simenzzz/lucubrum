import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-sm font-semibold font-body',
    'rounded-xl',
    'transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-hearth-900',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-hearth-700 text-warm-50',
          'border border-border-moderate',
          'hover:bg-hearth-600 hover:border-border-strong',
          'shadow-sm hover:shadow-md',
        ],
        primary: [
          'text-hearth-900 font-semibold',
          'bg-gradient-to-b from-amber-light via-amber to-amber-dark',
          'border border-amber-dark/50',
          'shadow-md',
          'hover:shadow-glow-amber hover:brightness-110',
          'active:brightness-95',
        ],
        secondary: [
          'bg-hearth-700/80 text-warm-50',
          'border border-border-moderate',
          'backdrop-blur-sm',
          'shadow-sm',
          'hover:bg-hearth-600 hover:border-border-strong hover:shadow-md',
        ],
        outline: [
          'border-2 border-amber/40 text-warm-50 bg-transparent',
          'hover:border-amber/70 hover:bg-amber/5',
          'shadow-sm hover:shadow-md',
        ],
        ghost: [
          'text-warm-200 bg-transparent',
          'hover:bg-hearth-700/50 hover:text-warm-50',
        ],
        link: [
          'text-amber underline-offset-4',
          'hover:underline hover:text-amber-light',
        ],
        destructive: [
          'bg-rose text-warm-50',
          'border border-rose-dark/50',
          'shadow-md',
          'hover:bg-rose-light hover:shadow-glow-rose',
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
