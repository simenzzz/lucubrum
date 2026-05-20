import axios, { AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import type { ApiError } from '@/types/api.types';
import { clearAuthStorage } from '@/lib/tokenStorage';
import {
  initAuthBroadcast,
  broadcastRefreshStart,
  broadcastRefreshComplete,
  broadcastRefreshFailed,
  broadcastLogout,
} from '@/lib/authBroadcast';

// API base URL from env - empty string is valid (relative URLs behind nginx proxy)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
if (API_BASE_URL === undefined || API_BASE_URL === null) {
  throw new Error(
    'VITE_API_BASE_URL environment variable is required. ' +
    'Set it in your .env file (use empty string for relative URLs).'
  );
}

/**
 * Create axios instance with default config
 * Uses withCredentials for HTTP-only cookie auth
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_SECONDS || 120) * 1000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable cookie-based auth
});

// Track ongoing refresh requests to prevent multiple simultaneous refreshes
// This is now synchronized across tabs via BroadcastChannel
let isRefreshing = false;
let refreshSubscribers: Array<() => void> = [];

/**
 * Initialize cross-tab auth synchronization
 * This ensures that when one tab refreshes the token, all tabs receive the update
 * and that multiple tabs don't try to refresh simultaneously
 */
initAuthBroadcast({
  // Another tab started refreshing - mark ourselves as waiting
  onRefreshStart: () => {
    isRefreshing = true;
  },

  // Another tab completed refresh - notify pending requests
  onRefreshComplete: () => {
    // Notify any pending requests in this tab (cookies already set by browser)
    onTokenRefreshed();
    isRefreshing = false;
  },

  // Another tab's refresh failed - logout this tab too
  onRefreshFailed: () => {
    isRefreshing = false;
    clearAuthStorage();
    window.location.href = '/?logout=true';
  },

  // Another tab logged out - logout this tab too
  onLogout: () => {
    clearAuthStorage();
    window.location.href = '/?logout=true';
  },
});

/**
 * Add subscriber to be notified when token refresh completes
 */
function subscribeTokenRefresh(callback: () => void) {
  refreshSubscribers.push(callback);
}

/**
 * Notify all subscribers that token has been refreshed
 */
function onTokenRefreshed() {
  refreshSubscribers.forEach(callback => callback());
  refreshSubscribers = [];
}

/**
 * Handle API errors and extract standardized error message
 */
export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    if (data?.message) {
      return data.message;
    }
    return error.message || 'An unexpected error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Request interceptor - Add request ID to requests
 * Note: Auth is handled via HTTP-only cookies, no Authorization header needed
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Add request ID for tracing
    config.headers['X-Request-ID'] = crypto.randomUUID();

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - Handle token refresh on 401
 * With HTTP-only cookies, the browser handles cookie transmission automatically
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      // If this is a refresh request that failed, logout
      if (originalRequest.url?.includes('/auth/refresh')) {
        clearAuthStorage();
        // Trigger logout by redirecting to home
        window.location.href = '/?logout=true';
        return Promise.reject(error);
      }

      // Try to refresh using cookies (browser sends refresh_token cookie automatically)
      if (!isRefreshing) {
        isRefreshing = true;
        originalRequest._retry = true;

        // Notify other tabs that we're starting a refresh
        broadcastRefreshStart();

        try {
          await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            {},
            {
              headers: { 'Content-Type': 'application/json' },
              withCredentials: true, // Include cookies
            }
          );

          // Notify all waiting requests in this tab
          onTokenRefreshed();

          // Notify other tabs that refresh completed
          broadcastRefreshComplete();

          // Retry original request (cookies updated by browser)
          return apiClient(originalRequest);
        } catch (refreshError) {
          // Refresh failed, notify other tabs
          broadcastRefreshFailed();

          // Clear storage and redirect
          clearAuthStorage();
          window.location.href = '/?logout=true';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        // Already refreshing, wait for it to complete
        return new Promise((resolve) => {
          subscribeTokenRefresh(() => {
            resolve(apiClient(originalRequest));
          });
        });
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Broadcast logout to other tabs
 * Call this when the user explicitly logs out
 */
export function notifyLogout(): void {
  broadcastLogout();
}

/**
 * Clear old localStorage tokens (migration from Bearer to cookie auth)
 */
export function clearLegacyTokens(): void {
  try {
    localStorage.removeItem('lucubrum_refresh_token');
  } catch {
    // Ignore errors
  }
}

export default apiClient;
