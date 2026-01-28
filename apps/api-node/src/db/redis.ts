/**
 * Redis client for caching using ioredis.
 */

import Redis from 'ioredis';
import logger from '../utils/logger';

class RedisClient {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(url, {
      keyPrefix: 'lh:',
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });

    // Log connection events
    this.client.on('connect', () => {
      if (!this.isConnected) {
        logger.info('Redis client connected');
        this.isConnected = true;
      }
    });

    this.client.on('error', (err) => {
      logger.error({ err }, 'Redis client error');
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.info('Redis client disconnected');
    });
  }

  /**
   * Get a string value by key.
   * Fails open - returns null on errors.
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.warn({ error, key }, 'Redis get failed, failing open');
      return null;
    }
  }

  /**
   * Set a string value with optional TTL.
   * Fails open - logs warning on errors.
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.warn({ error, key }, 'Redis set failed, failing open');
    }
  }

  /**
   * Get and parse JSON value by key.
   * Fails open - returns null on errors.
   */
  async getJSON<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      logger.warn({ error, key }, 'Redis getJSON failed, failing open');
      return null;
    }
  }

  /**
   * Set JSON value with optional TTL.
   * Fails open - logs warning on errors.
   */
  async setJSON<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      logger.warn({ error, key }, 'Redis setJSON failed, failing open');
    }
  }

  /**
   * Delete a key.
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.warn({ error, key }, 'Redis del failed');
    }
  }

  /**
   * Check if Redis connection is healthy.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error({ error }, 'Redis health check failed');
      return false;
    }
  }

  /**
   * Close the Redis connection.
   */
  async close(): Promise<void> {
    await this.client.quit();
    this.isConnected = false;
    logger.info('Redis client closed');
  }

  /**
   * Check if client is currently connected.
   */
  isReady(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  /**
   * Get the underlying ioredis client for advanced operations.
   * Use with caution - prefer the wrapped methods when possible.
   */
  getClient(): Redis {
    return this.client;
  }

  // ==================== Auth-related methods ====================

  /**
   * Blacklist an access token by its JTI.
   * TTL is set to the remaining lifetime of the token.
   * Key format: lh:auth:blacklist:{jti}
   */
  async blacklistToken(jti: string, expiresAt: Date): Promise<void> {
    const ttlSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    if (ttlSeconds <= 0) {
      // Token already expired, no need to blacklist
      return;
    }

    try {
      await this.client.setex(`auth:blacklist:${jti}`, ttlSeconds, '1');
      logger.debug({ jti, ttlSeconds }, 'Token blacklisted');
    } catch (error) {
      logger.warn({ error, jti }, 'Failed to blacklist token, failing open');
    }
  }

  /**
   * Check if a token is blacklisted.
   * Fails open - returns false on errors (allows the request).
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    try {
      const result = await this.client.get(`auth:blacklist:${jti}`);
      return result !== null;
    } catch (error) {
      logger.warn({ error, jti }, 'Failed to check token blacklist, failing open');
      return false;
    }
  }

  /**
   * Store PKCE code verifier with state as key.
   * Key format: lh:auth:pkce:{state}
   * Default TTL: 600 seconds (10 minutes)
   */
  async storePKCEState(state: string, verifier: string, ttlSeconds: number = 600): Promise<void> {
    try {
      await this.client.setex(`auth:pkce:${state}`, ttlSeconds, verifier);
      logger.debug({ state: state.substring(0, 8) + '...' }, 'PKCE state stored');
    } catch (error) {
      logger.error({ error, state: state.substring(0, 8) + '...' }, 'Failed to store PKCE state');
      throw new Error('Failed to store PKCE state');
    }
  }

  /**
   * Consume PKCE state - get the verifier and delete the state atomically.
   * Returns null if state not found or expired.
   */
  async consumePKCEState(state: string): Promise<string | null> {
    try {
      const key = `auth:pkce:${state}`;
      // Get and delete atomically using multi
      const multi = this.client.multi();
      multi.get(key);
      multi.del(key);
      const results = await multi.exec();

      if (!results || !results[0] || results[0][1] === null) {
        logger.debug({ state: state.substring(0, 8) + '...' }, 'PKCE state not found or expired');
        return null;
      }

      const verifier = results[0][1] as string;
      logger.debug({ state: state.substring(0, 8) + '...' }, 'PKCE state consumed');
      return verifier;
    } catch (error) {
      logger.error({ error, state: state.substring(0, 8) + '...' }, 'Failed to consume PKCE state');
      return null;
    }
  }
}

// Export singleton instance
export const redis = new RedisClient();
export default redis;

// Export class for testing
export { RedisClient };

// Export the raw ioredis client getter for advanced operations (rate limiting)
export const getRedisClient = () => (redis as any).client;
