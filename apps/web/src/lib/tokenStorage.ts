/**
 * Auth storage utilities
 *
 * Strategy:
 * - Tokens: Stored in HTTP-only cookies (managed by server)
 * - PKCE verifier: Stored in sessionStorage for OAuth flow
 */

const STORAGE_KEYS = {
  PKCE_VERIFIER: 'lucubrum_pkce_verifier',
  PKCE_STATE: 'lucubrum_pkce_state',
  OAUTH_PROVIDER: 'lucubrum_oauth_provider',
} as const;

/**
 * Store PKCE code verifier in sessionStorage
 */
export function setPKCEVerifier(verifier: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS.PKCE_VERIFIER, verifier);
  } catch (error) {
    console.error('Failed to store PKCE verifier:', error);
  }
}

/**
 * Get PKCE code verifier from sessionStorage
 */
export function getPKCEVerifier(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.PKCE_VERIFIER);
  } catch (error) {
    console.error('Failed to retrieve PKCE verifier:', error);
    return null;
  }
}

/**
 * Remove PKCE code verifier from sessionStorage
 */
export function removePKCEVerifier(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.PKCE_VERIFIER);
  } catch (error) {
    console.error('Failed to remove PKCE verifier:', error);
  }
}

/**
 * Store PKCE state in sessionStorage
 */
export function setPKCEState(state: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS.PKCE_STATE, state);
  } catch (error) {
    console.error('Failed to store PKCE state:', error);
  }
}

/**
 * Get PKCE state from sessionStorage
 */
export function getPKCEState(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.PKCE_STATE);
  } catch (error) {
    console.error('Failed to retrieve PKCE state:', error);
    return null;
  }
}

/**
 * Remove PKCE state from sessionStorage
 */
export function removePKCEState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.PKCE_STATE);
  } catch (error) {
    console.error('Failed to remove PKCE state:', error);
  }
}

/**
 * Store OAuth provider name in sessionStorage (e.g. 'google', 'facebook')
 */
export function setOAuthProvider(provider: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEYS.OAUTH_PROVIDER, provider);
  } catch (error) {
    console.error('Failed to store OAuth provider:', error);
  }
}

/**
 * Get OAuth provider name from sessionStorage
 */
export function getOAuthProvider(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.OAUTH_PROVIDER);
  } catch (error) {
    console.error('Failed to retrieve OAuth provider:', error);
    return null;
  }
}

/**
 * Remove OAuth provider from sessionStorage
 */
export function removeOAuthProvider(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.OAUTH_PROVIDER);
  } catch (error) {
    console.error('Failed to remove OAuth provider:', error);
  }
}

/**
 * Clear all auth-related storage (PKCE state and legacy tokens)
 */
export function clearAuthStorage(): void {
  removePKCEVerifier();
  removePKCEState();
  removeOAuthProvider();

  // Clean up legacy token storage from previous auth implementation
  try {
    localStorage.removeItem('lucubrum_refresh_token');
  } catch {
    // Ignore errors
  }
}
