/**
 * Auth storage utilities
 *
 * Strategy:
 * - Tokens: Stored in HTTP-only cookies (managed by server)
 * - PKCE state: Stored in sessionStorage for the OAuth flow
 */

const STORAGE_KEYS = {
  PKCE_STATE: 'lucubrum_pkce_state',
} as const;

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
 * Clear old localStorage tokens (migration from Bearer to cookie auth)
 */
export function clearLegacyTokens(): void {
  try {
    localStorage.removeItem('lucubrum_refresh_token');
  } catch {
    // Ignore errors
  }
}

/**
 * Clear all auth-related storage (PKCE state + legacy tokens).
 * Called on logout, refresh failure, and cross-tab logout.
 */
export function clearAuthStorage(): void {
  removePKCEState();
  clearLegacyTokens();
}
