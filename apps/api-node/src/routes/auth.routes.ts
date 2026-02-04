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
} from '../validation/schemas';
import { UserRow } from '../db/queries/users';
import {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromCookies,
} from '../utils/cookies';

const router = Router();

// Response type definitions
interface OAuthInitResponse {
  authorization_url: string;
  state: string;
}

interface OAuthCallbackResponse {
  user: UserRow;
  authenticated: boolean;
}

interface RefreshResponse {
  authenticated: boolean;
}

interface LogoutResponse {
  message: string;
  refresh_token_revoked?: boolean;
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
 * Sets tokens in HTTP-only cookies.
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

      // Set tokens in HTTP-only cookies
      setAuthCookies(res, result.tokens.access_token, result.tokens.refresh_token);

      return res.json({
        user: result.user,
        authenticated: true,
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
 * Reads refresh token from HTTP-only cookie, sets new access token cookie.
 */
router.post(
  '/refresh',
  async (
    req: Request,
    res: Response<RefreshResponse | ErrorResponse>
  ) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    try {
      // Get refresh token from cookie
      const refresh_token = getRefreshTokenFromCookies(req.cookies);

      if (!refresh_token) {
        return res.status(401).json({
          error: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or missing refresh token',
          request_id: requestId,
        });
      }

      const result = await authService.refreshAccessToken(refresh_token, requestId);

      // Set new access token in cookie
      setAuthCookies(res, result.access_token);

      return res.json({
        authenticated: true,
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
 * Requires authentication. Reads refresh token from cookie.
 *
 * Always blacklists the access token, even if refresh token cookie is missing.
 * This ensures the current access token cannot be used after logout.
 */
router.post(
  '/logout',
  requireAuth,
  async (
    req: Request,
    res: Response<LogoutResponse | ErrorResponse>
  ) => {
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    // Get access token info from request (set by requireAuth middleware)
    const { jti, exp } = req.user!;

    // Get refresh token from cookie
    const refresh_token = getRefreshTokenFromCookies(req.cookies);

    let refreshTokenRevoked = false;

    if (refresh_token) {
      // Full logout: revoke refresh token and blacklist access token
      try {
        await authService.logout(refresh_token, jti, exp, requestId);
        refreshTokenRevoked = true;
      } catch (error) {
        // If refresh token revocation fails (e.g., Redis/DB down), don't clear cookies
        // Let the request fail so user knows logout didn't fully complete
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
    } else {
      // No refresh token cookie - still blacklist the access token
      // This can happen if:
      // - Cookie was cleared/expired
      // - User is logging out from a different browser/device
      // - Refresh token cookie path didn't match
      try {
        await authService.blacklistAccessToken(jti, exp, requestId);
        logger.info(
          { requestId, jti },
          'Logout without refresh token - access token blacklisted only'
        );
      } catch (error) {
        // If blacklisting fails, don't clear cookies
        logger.error({ error, requestId }, 'Failed to blacklist access token');
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Failed to complete logout',
          request_id: requestId,
        });
      }
    }

    // Clear auth cookies only after successful token operations
    clearAuthCookies(res);

    return res.json({
      message: 'Logged out successfully',
      refresh_token_revoked: refreshTokenRevoked,
    });
  }
);

export default router;
