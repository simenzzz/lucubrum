import apiClient, { getApiError } from './client';
import { setPKCEState } from '@/lib/tokenStorage';
import {
  GoogleAuthResponseSchema,
  AuthCallbackResponseSchema,
  safeParseWithLogging,
} from '@/types/schemas';
import type {
  GoogleAuthRequest,
  GoogleAuthResponse,
  AuthCallbackRequest,
  AuthCallbackResponse,
} from '@/types/api.types';

/**
 * Auth API endpoints
 * Uses HTTP-only cookies for token storage
 */
export const authApi = {
  /**
   * Get Google OAuth authorization URL
   */
  async getGoogleAuthUrl(params?: GoogleAuthRequest): Promise<GoogleAuthResponse> {
    try {
      const response = await apiClient.get('/auth/google', {
        params,
      });
      // Validate response
      const data = safeParseWithLogging(
        GoogleAuthResponseSchema,
        response.data,
        'getGoogleAuthUrl'
      );
      // Store the state for PKCE validation on callback
      setPKCEState(data.state);
      return data;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Exchange OAuth code for tokens
   * Server sets HTTP-only cookies, returns user data
   */
  async callback(request: AuthCallbackRequest): Promise<AuthCallbackResponse> {
    try {
      const response = await apiClient.post('/auth/callback', request);
      // Validate response
      return safeParseWithLogging(
        AuthCallbackResponseSchema,
        response.data,
        'callback'
      );
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Refresh access token
   * Server reads refresh token from cookie and sets new access token cookie
   */
  async refresh(): Promise<void> {
    try {
      await apiClient.post('/auth/refresh');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Logout and revoke refresh token
   * Server clears auth cookies
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      // Don't throw on logout, just log
      console.error('Logout error:', getApiError(error));
    }
  },
};
