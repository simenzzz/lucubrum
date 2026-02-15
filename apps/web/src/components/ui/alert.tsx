import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm',
  {
    variants: {
      variant: {
        default: 'bg-hearth-800 text-warm-50 border-border-moderate',
        info: 'bg-lavender/10 text-lavender border-lavender/30',
        warning: 'bg-amber/10 text-amber border-amber/30',
        success: 'bg-sage/10 text-sage border-sage/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  icon?: React.ReactNode;
}

function Alert({ className, variant, icon, children, ...props }: AlertProps) {
  return (
    <div className={cn(alertVariants({ variant }), className)} {...props}>
      {icon && <div className="flex items-start gap-3">{icon}<div>{children}</div></div>}
      {!icon && children}
    </div>
  );
}

function AlertDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-sm', className)}>{children}</div>;
}

export { Alert, AlertDescription, alertVariants };
