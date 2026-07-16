import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

/** Max simultaneously visible toasts — oldest are dropped beyond this */
const TOAST_LIMIT = 3;

interface UIState {
  // Toast state
  toasts: Toast[];

  // Actions
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  toasts: [],

  /**
   * Add a toast notification.
   * Timing/dismissal is owned by the Radix Toast in ToastContainer (via
   * `duration`), which calls removeToast after the exit animation.
   */
  addToast: (toast) => {
    // Note: under Radix, duration 0 means "close immediately" (there is no
    // "never auto-dismiss" sentinel); no caller currently passes duration.
    const newToast: Toast = {
      ...toast,
      id: crypto.randomUUID(),
      duration: toast.duration ?? 5000,
    };

    set((state) => ({
      toasts: [...state.toasts, newToast].slice(-TOAST_LIMIT),
    }));
  },

  /**
   * Remove a toast by ID
   */
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
