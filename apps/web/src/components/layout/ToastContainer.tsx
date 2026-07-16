/**
 * Renders uiStore toasts with the shadcn/Radix Toast primitives.
 * uiStore.addToast() is the single toast API; Radix owns timing and
 * dismissal, and store removal happens after the exit animation.
 */
import { Info, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useUIStore, type ToastType } from '@/stores/uiStore';

const TOAST_ICONS: Record<ToastType, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle, className: 'text-sage' },
  error: { icon: AlertCircle, className: 'text-rose' },
  warning: { icon: AlertTriangle, className: 'text-amber' },
  info: { icon: Info, className: 'text-lavender' },
};

/** Matches the toast exit animation so removal doesn't cut it short */
const EXIT_ANIMATION_MS = 300;

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();

  return (
    <ToastProvider>
      {toasts.map((t) => {
        const { icon: Icon, className } = TOAST_ICONS[t.type];
        return (
          <Toast
            key={t.id}
            variant={t.type}
            duration={t.duration ?? 5000}
            onOpenChange={(open) => {
              if (!open) {
                setTimeout(() => removeToast(t.id), EXIT_ANIMATION_MS);
              }
            }}
          >
            <div className="flex gap-3">
              <div className={`flex-shrink-0 mt-0.5 ${className}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 grid gap-1">
                <ToastTitle>{t.title}</ToastTitle>
                {t.message && <ToastDescription>{t.message}</ToastDescription>}
              </div>
            </div>
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
