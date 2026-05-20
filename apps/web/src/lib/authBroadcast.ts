/**
 * Cross-tab authentication synchronization using BroadcastChannel API
 *
 * This module coordinates token refresh across multiple browser tabs to prevent
 * race conditions where multiple tabs attempt to refresh simultaneously.
 * With HTTP-only cookies, tokens sync automatically, but we still need to
 * coordinate refresh requests and logout events.
 *
 * Message types:
 * - REFRESH_START: A tab is starting a token refresh
 * - REFRESH_COMPLETE: Refresh succeeded (cookies updated by browser)
 * - REFRESH_FAILED: Refresh failed, all tabs should logout
 * - LOGOUT: User logged out in another tab
 */

type AuthMessage =
  | { type: 'REFRESH_START' }
  | { type: 'REFRESH_COMPLETE' }
  | { type: 'REFRESH_FAILED' }
  | { type: 'LOGOUT' };

type AuthMessageHandler = {
  onRefreshStart?: () => void;
  onRefreshComplete?: () => void;
  onRefreshFailed?: () => void;
  onLogout?: () => void;
};

const CHANNEL_NAME = 'lucubrum-auth-sync';

// Check if BroadcastChannel is supported
const isBroadcastChannelSupported = typeof BroadcastChannel !== 'undefined';

let channel: BroadcastChannel | null = null;
let messageHandler: AuthMessageHandler = {};

/**
 * Initialize the auth broadcast channel
 */
export function initAuthBroadcast(handlers: AuthMessageHandler): void {
  if (!isBroadcastChannelSupported) {
    console.warn('BroadcastChannel not supported, cross-tab auth sync disabled');
    return;
  }

  // Close existing channel if any
  if (channel) {
    channel.close();
  }

  messageHandler = handlers;
  channel = new BroadcastChannel(CHANNEL_NAME);

  channel.onmessage = (event: MessageEvent<AuthMessage>) => {
    const message = event.data;

    switch (message.type) {
      case 'REFRESH_START':
        messageHandler.onRefreshStart?.();
        break;
      case 'REFRESH_COMPLETE':
        messageHandler.onRefreshComplete?.();
        break;
      case 'REFRESH_FAILED':
        messageHandler.onRefreshFailed?.();
        break;
      case 'LOGOUT':
        messageHandler.onLogout?.();
        break;
    }
  };

  channel.onmessageerror = (event) => {
    console.error('Auth broadcast message error:', event);
  };
}

/**
 * Broadcast that a refresh is starting
 */
export function broadcastRefreshStart(): void {
  if (!channel) return;

  try {
    channel.postMessage({ type: 'REFRESH_START' } satisfies AuthMessage);
  } catch (error) {
    console.error('Failed to broadcast refresh start:', error);
  }
}

/**
 * Broadcast that a refresh completed successfully
 */
export function broadcastRefreshComplete(): void {
  if (!channel) return;

  try {
    channel.postMessage({ type: 'REFRESH_COMPLETE' } satisfies AuthMessage);
  } catch (error) {
    console.error('Failed to broadcast refresh complete:', error);
  }
}

/**
 * Broadcast that a refresh failed
 */
export function broadcastRefreshFailed(): void {
  if (!channel) return;

  try {
    channel.postMessage({ type: 'REFRESH_FAILED' } satisfies AuthMessage);
  } catch (error) {
    console.error('Failed to broadcast refresh failed:', error);
  }
}

/**
 * Broadcast that user logged out
 */
export function broadcastLogout(): void {
  if (!channel) return;

  try {
    channel.postMessage({ type: 'LOGOUT' } satisfies AuthMessage);
  } catch (error) {
    console.error('Failed to broadcast logout:', error);
  }
}

/**
 * Close the broadcast channel (call on app unmount)
 */
export function closeAuthBroadcast(): void {
  if (channel) {
    channel.close();
    channel = null;
  }
  messageHandler = {};
}

/**
 * Check if broadcast channel is active
 */
export function isAuthBroadcastActive(): boolean {
  return channel !== null;
}
