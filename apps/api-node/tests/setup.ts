// Mock environment variables (will be overridden by Docker)
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test_user:test_password@localhost:5433/lucubrum_test';
process.env.POSTGRES_HOST = process.env.POSTGRES_HOST || 'localhost';
process.env.POSTGRES_DB = process.env.POSTGRES_DB || 'lucubrum_test';
process.env.POSTGRES_USER = process.env.POSTGRES_USER || 'test_user';
process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test_password';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';
process.env.SERVICE_TOKEN = 'test-service-token';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-38chars!!';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.LOG_LEVEL = 'error';

// Clean up after all tests
afterAll(async () => {
  // Close database connection pool
  const { db } = await import('../src/db/client');
  await db.close();

  // Close Redis connection
  const { redis } = await import('../src/db/redis');
  await redis.close();
});
