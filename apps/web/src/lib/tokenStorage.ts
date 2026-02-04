/**
 * Auth storage utilities
 *
 * Strategy:
 * - Tokens: Stored in HTTP-only cookies (managed by server)
 * - PKCE verifier: Stored in sessionStorage for OAuth flow
 */

const STORAGE_KEYS = {
  PKCE_VERIFIER: 'learning_helper_pkce_verifier',
  PKCE_STATE: 'learning_helper_pkce_state',
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
 * Clear all auth-related storage (PKCE state and legacy tokens)
 */
export function clearAuthStorage(): void {
  removePKCEVerifier();
  removePKCEState();

  // Clean up legacy token storage from previous auth implementation
  try {
    localStorage.removeItem('learning_helper_refresh_token');
  } catch {
    // Ignore errors
  }
}
