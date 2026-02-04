/**
 * Message-in-a-bottle toast container
 * Uses the Shadcn toast system with custom styling
 */
import { Toaster as ShadcnToaster } from '@/components/ui/toaster';
import { useUIStore } from '@/stores/uiStore';
import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/use-toast';

export function ToastContainer() {
  const { toasts } = useUIStore();
  // Track which toast IDs have already been displayed to prevent duplicates
  const displayedIds = useRef<Set<string>>(new Set());

  // Forward Zustand toasts to Shadcn toast system
  useEffect(() => {
    toasts.forEach((t) => {
      if (!displayedIds.current.has(t.id)) {
        displayedIds.current.add(t.id);
        toast({
          title: t.title,
          description: t.message,
          variant: t.type,
        });
      }
    });

    // Clean up IDs that are no longer in the toasts array
    const currentIds = new Set(toasts.map((t) => t.id));
    displayedIds.current.forEach((id) => {
      if (!currentIds.has(id)) {
        displayedIds.current.delete(id);
      }
    });
  }, [toasts]);

  return <ShadcnToaster />;
}
