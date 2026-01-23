/**
 * PostgreSQL database client using pg pool.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import logger from '../utils/logger';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
}

function getConfig(): DatabaseConfig {
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'learning_helper',
    user: process.env.POSTGRES_USER || 'learning_helper',
    password: process.env.POSTGRES_PASSWORD || 'learning_helper_dev',
    max: parseInt(process.env.POSTGRES_POOL_MAX || '10', 10),
  };
}

class DatabaseClient {
  private pool: Pool;
  private isConnected: boolean = false;

  constructor(config?: DatabaseConfig) {
    const dbConfig = config || getConfig();
    this.pool = new Pool({
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      max: dbConfig.max,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Log pool errors
    this.pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected pool error');
    });

    // Log connection events
    this.pool.on('connect', () => {
      if (!this.isConnected) {
        logger.info('Database pool connected');
        this.isConnected = true;
      }
    });
  }

  /**
   * Execute a query with optional parameters.
   */
  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug(
        { query: text.substring(0, 100), duration, rows: result.rowCount },
        'Query executed'
      );
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error({ query: text.substring(0, 100), duration, error }, 'Query failed');
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction.
   * Automatically handles BEGIN, COMMIT, and ROLLBACK.
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error }, 'Transaction rolled back');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if the database connection is healthy.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1 as health');
      return result.rows[0]?.health === 1;
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
      return false;
    }
  }

  /**
   * Close all connections in the pool.
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    logger.info('Database pool closed');
  }

  /**
   * Get pool statistics for monitoring.
   */
  getPoolStats(): { total: number; idle: number; waiting: number } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

// Export singleton instance
export const db = new DatabaseClient();
export default db;

// Export class for testing
export { DatabaseClient };
