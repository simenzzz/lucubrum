/**
 * Authentication routes for Google OAuth 2.0.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import { authService, AuthServiceError } from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import {
  OAuthCallbackSchema,
  RefreshTokenSchema,
  LogoutSchema,
} from '../validation/schemas';
import { UserRow } from '../db/queries/users';

const router = Router();

// Response type definitions
interface OAuthInitResponse {
  authorization_url: string;
  state: string;
}

interface OAuthCallbackResponse {
  user: UserRow;
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
  };
}

interface RefreshResponse {
  access_token: string;
  expires_at: string;
}

interface LogoutResponse {
  message: string;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

/**
 * GET /auth/google
 *
 * Initiate Google OAuth flow.
 * Returns the authorization URL and state parameter.
 */
router.get(
  '/google',
  async (
    _req: Request,
    res: Response<OAuthInitResponse | ErrorResponse>
  ) => {
    const requestId = uuidv4();

    try {
      const result = await authService.initiateGoogleOAuth();

      logger.info({ requestId }, 'OAuth initiation successful');

      return res.json({
        authorization_url: result.authorization_url,
        state: result.state,
      });
    } catch (error) {
      logger.error({ error, requestId }, 'OAuth initiation failed');
      return res.status(500).json({
        error: 'OAUTH_INIT_FAILED',
        message: 'Failed to initiate OAuth flow',
        request_id: requestId,
      });
    }
  }
);

/**
 * POST /auth/callback
 *
 * Handle Google OAuth callback.
 * Exchanges authorization code for tokens and creates/updates user.
 */
router.post(
  '/callback',
  async (
    req: Request,
    res: Response<OAuthCallbackResponse | ErrorResponse>
  ) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    try {
      // Validate input
      const parseResult = OAuthCallbackSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(
          (e) => `${e.path.join('.')}: ${e.message}`
        );
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: { validation_errors: errors },
          request_id: requestId,
        });
      }

      const { code, state } = parseResult.data;

      const result = await authService.handleGoogleCallback(code, state, requestId);

      return res.json({
        user: result.user,
        tokens: result.tokens,
      });
    } catch (error) {
      if ((error as AuthServiceError).code) {
        const authError = error as AuthServiceError;
        logger.warn({ error: authError, requestId }, 'OAuth callback error');
        return res.status(authError.statusCode).json({
          error: authError.code,
          message: authError.message,
          request_id: requestId,
        });
      }

      logger.error({ error, requestId }, 'Unexpected OAuth callback error');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

/**
 * POST /auth/refresh
 *
 * Refresh an access token using a valid refresh token.
 */
router.post(
  '/refresh',
  async (
    req: Request,
    res: Response<RefreshResponse | ErrorResponse>
  ) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    try {
      // Validate input
      const parseResult = RefreshTokenSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(
          (e) => `${e.path.join('.')}: ${e.message}`
        );
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: { validation_errors: errors },
          request_id: requestId,
        });
      }

      const { refresh_token } = parseResult.data;

      const result = await authService.refreshAccessToken(refresh_token, requestId);

      return res.json({
        access_token: result.access_token,
        expires_at: result.expires_at,
      });
    } catch (error) {
      if ((error as AuthServiceError).code) {
        const authError = error as AuthServiceError;
        logger.warn({ error: authError, requestId }, 'Token refresh error');
        return res.status(authError.statusCode).json({
          error: authError.code,
          message: authError.message,
          request_id: requestId,
        });
      }

      logger.error({ error, requestId }, 'Unexpected token refresh error');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

/**
 * POST /auth/logout
 *
 * Logout - revoke refresh token and blacklist access token.
 * Requires authentication.
 */
router.post(
  '/logout',
  requireAuth,
  async (
    req: Request,
    res: Response<LogoutResponse | ErrorResponse>
  ) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    try {
      // Validate input
      const parseResult = LogoutSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errors = parseResult.error.errors.map(
          (e) => `${e.path.join('.')}: ${e.message}`
        );
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: { validation_errors: errors },
          request_id: requestId,
        });
      }

      const { refresh_token } = parseResult.data;

      // Get access token info from request (set by requireAuth middleware)
      const { jti, exp } = req.user!;

      await authService.logout(refresh_token, jti, exp, requestId);

      return res.json({
        message: 'Logged out successfully',
      });
    } catch (error) {
      if ((error as AuthServiceError).code) {
        const authError = error as AuthServiceError;
        logger.warn({ error: authError, requestId }, 'Logout error');
        return res.status(authError.statusCode).json({
          error: authError.code,
          message: authError.message,
          request_id: requestId,
        });
      }

      logger.error({ error, requestId }, 'Unexpected logout error');
      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        request_id: requestId,
      });
    }
  }
);

export default router;
