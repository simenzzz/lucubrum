import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

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
    const newToast: Toast = {
      id: crypto.randomUUID(),
      duration: toast.duration ?? 5000,
      ...toast,
    };

    set((state) => ({
      toasts: [...state.toasts, newToast],
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
