import { useToast } from '@/components/ui/use-toast';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { Info, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

export function Toaster() {
  const { toasts } = useToast();

  const getIcon = (variant: string) => {
    switch (variant) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-forest" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-terracotta" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-gold" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-ocean" />;
    }
  };

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant = 'default', ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5">{getIcon(variant || 'default')}</div>
              <div className="flex-1 grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
