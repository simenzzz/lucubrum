import apiClient, { getApiError } from './client';
import { setPKCEState, setOAuthProvider } from '@/lib/tokenStorage';
import {
  OAuthInitResponseSchema,
  AuthCallbackResponseSchema,
  safeParseWithLogging,
} from '@/types/schemas';
import type {
  GoogleAuthRequest,
  OAuthInitResponse,
  AuthCallbackRequest,
  AuthCallbackResponse,
  EmailRegisterRequest,
  EmailLoginRequest,
} from '@/types/api.types';

/**
 * Auth API endpoints
 * Uses HTTP-only cookies for token storage
 */
export const authApi = {
  /**
   * Get Google OAuth authorization URL
   */
  async getGoogleAuthUrl(params?: GoogleAuthRequest): Promise<OAuthInitResponse> {
    try {
      const response = await apiClient.get('/auth/google', { params });
      const data = safeParseWithLogging(OAuthInitResponseSchema, response.data, 'getGoogleAuthUrl');
      setPKCEState(data.state);
      setOAuthProvider('google');
      return data;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Get Facebook OAuth authorization URL
   */
  async getFacebookAuthUrl(): Promise<OAuthInitResponse> {
    try {
      const response = await apiClient.get('/auth/facebook');
      const data = safeParseWithLogging(OAuthInitResponseSchema, response.data, 'getFacebookAuthUrl');
      setPKCEState(data.state);
      setOAuthProvider('facebook');
      return data;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Exchange Google OAuth code for tokens
   * Server sets HTTP-only cookies, returns user data
   */
  async callback(request: AuthCallbackRequest): Promise<AuthCallbackResponse> {
    try {
      const response = await apiClient.post('/auth/callback', request);
      return safeParseWithLogging(AuthCallbackResponseSchema, response.data, 'callback');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Exchange Facebook OAuth code for tokens
   */
  async exchangeFacebookCallback(request: AuthCallbackRequest): Promise<AuthCallbackResponse> {
    try {
      const response = await apiClient.post('/auth/facebook/callback', request);
      return safeParseWithLogging(AuthCallbackResponseSchema, response.data, 'exchangeFacebookCallback');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Register a new user with email and password
   */
  async registerWithEmail(request: EmailRegisterRequest): Promise<AuthCallbackResponse> {
    try {
      const response = await apiClient.post('/auth/email/register', request);
      return safeParseWithLogging(AuthCallbackResponseSchema, response.data, 'registerWithEmail');
    } catch (error) {
      throw new Error(getApiError(error));
    }
  },

  /**
   * Login with email and password
   */
  async loginWithEmail(request: EmailLoginRequest): Promise<AuthCallbackResponse> {
    try {
      const response = await apiClient.post('/auth/email/login', request);
      return safeParseWithLogging(AuthCallbackResponseSchema, response.data, 'loginWithEmail');
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
