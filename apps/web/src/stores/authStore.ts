import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/api.types';
import {
  clearAuthStorage,
  getPKCEState,
  removePKCEState,
} from '@/lib/tokenStorage';
import { notifyLogout, clearLegacyTokens } from '@/api/client';
import { authApi } from '@/api/auth.api';

interface AuthState {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;

  // Actions
  login: () => Promise<void>;
  handleCallback: (code: string, state: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: true,
      isHydrated: false,
      error: null,

      /**
       * Initiate Google OAuth login
       */
      login: async () => {
        set({ isLoading: true, error: null });
        try {
          const { authorization_url } = await authApi.getGoogleAuthUrl();
          // Redirect to Google OAuth
          window.location.href = authorization_url;
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false });
        }
      },

      /**
       * Handle OAuth callback
       * Server sets HTTP-only cookies, we just receive user data
       */
      handleCallback: async (code: string, state: string) => {
        set({ isLoading: true, error: null });
        try {
          // Validate PKCE state before making API call
          const storedState = getPKCEState();
          if (!storedState || state !== storedState) {
            throw new Error('Invalid authentication state. Please try again.');
          }
          // Clear PKCE state after validation
          removePKCEState();

          // Clear any legacy tokens from previous auth implementation
          clearLegacyTokens();

          const response = await authApi.callback({ code, state });

          // Update state (tokens are in HTTP-only cookies)
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      },

      /**
       * Logout user
       */
      logout: async () => {
        // Try to logout on server (clears cookies)
        try {
          await authApi.logout();
        } catch (error) {
          // Log but continue with local logout even if server logout fails
          console.error('Failed to logout on server:', error);
        }

        // Notify other tabs about logout
        notifyLogout();

        // Clear local storage
        clearAuthStorage();

        set({
          user: null,
          isAuthenticated: false,
          error: null,
        });
      },

      /**
       * Refresh authentication
       * With HTTP-only cookies, this just verifies the session is still valid
       */
      refreshAuth: async () => {
        try {
          await authApi.refresh();
          // Session is still valid, cookies updated by browser
        } catch {
          // Refresh failed, logout
          get().logout();
        }
      },

      /**
       * Clear error state
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * Set loading state
       */
      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      /**
       * Set hydrated state
       */
      setHydrated: (hydrated: boolean) => {
        set({ isHydrated: hydrated });
      },
    }),
    {
      name: 'learning-helper-auth',
      // Only persist user data, not loading/error states
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // Hydrate and verify session on load
      onRehydrateStorage: () => (state) => {
        if (state?.isAuthenticated) {
          // Verify session is still valid by refreshing
          state.refreshAuth().finally(() => {
            state.setLoading(false);
            state.setHydrated(true);
          });
        } else {
          state?.setLoading(false);
          state?.setHydrated(true);
        }
      },
    }
  )
);
