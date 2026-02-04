import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export type ModalType = 'nodePopup' | 'confirmLogout' | 'deletePlan' | null;

interface UIState {
  // Toast state
  toasts: Toast[];

  // Modal state
  activeModal: ModalType;
  modalData: unknown;

  // Global loading state
  isGlobalLoading: boolean;
  loadingMessage: string | null;

  // Actions
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;

  openModal: (modal: ModalType, data?: unknown) => void;
  closeModal: () => void;

  setGlobalLoading: (loading: boolean, message?: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  // Initial state
  toasts: [],
  activeModal: null,
  modalData: null,
  isGlobalLoading: false,
  loadingMessage: null,

  /**
   * Add a toast notification
   */
  addToast: (toast) => {
    const id = crypto.randomUUID();
    const newToast: Toast = {
      id,
      duration: toast.duration ?? 5000,
      ...toast,
    };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    // Auto-remove after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, newToast.duration);
    }
  },

  /**
   * Remove a toast by ID
   */
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  /**
   * Clear all toasts
   */
  clearToasts: () => {
    set({ toasts: [] });
  },

  /**
   * Open a modal
   */
  openModal: (modal, data) => {
    set({
      activeModal: modal,
      modalData: data,
    });
  },

  /**
   * Close the active modal
   */
  closeModal: () => {
    set({
      activeModal: null,
      modalData: null,
    });
  },

  /**
   * Set global loading state
   */
  setGlobalLoading: (loading, message = undefined) => {
    set({
      isGlobalLoading: loading,
      loadingMessage: message,
    });
  },
}));
