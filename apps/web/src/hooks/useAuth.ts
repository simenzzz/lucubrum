/**
 * Authentication hook
 * Provides auth state and methods from Zustand store
 */
import { useAuthStore } from '@/stores/authStore';
import { useEffect, useRef } from 'react';

export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading,
    isHydrated,
    error,
    loginWithGoogle,
    loginWithFacebook,
    loginWithEmail,
    registerWithEmail,
    handleCallback,
    logout,
    refreshAuth,
    clearError,
  } = useAuthStore();

  // Use ref to avoid interval reset when refreshAuth reference changes
  const refreshAuthRef = useRef(refreshAuth);
  useEffect(() => {
    refreshAuthRef.current = refreshAuth;
  }, [refreshAuth]);

  // Refresh auth token periodically (every 14 minutes, tokens expire at 15)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      refreshAuthRef.current();
    }, 14 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  return {
    user,
    isAuthenticated,
    isLoading,
    isHydrated,
    error,
    loginWithGoogle,
    loginWithFacebook,
    loginWithEmail,
    registerWithEmail,
    handleCallback,
    logout,
    refreshAuth,
    clearError,
  };
}
