import express from 'express';
import planRoutes from './routes/plan.routes';
import authRoutes from './routes/auth.routes';
import exerciseRoutes from './routes/exercise.routes';
import masteryRoutes from './routes/mastery.routes';
import adminRoutes from './routes/admin.routes';
import logger from './utils/logger';
import { db } from './db/client';
import { redis } from './db/redis';
import { curriculumClient } from './services/curriculum-client';
import { startQualitySignalsJob } from './jobs/quality-signals';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Request logging middleware
app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, 'Incoming request');
  next();
});

// Health check
app.get('/health', async (_req, res) => {
  const checks: Record<string, string> = {
    database: 'healthy',
    redis: 'healthy',
    python_service: 'healthy',
  };
  const errors: string[] = [];

  // Check database
  try {
    const dbHealthy = await db.healthCheck();
    if (!dbHealthy) {
      checks.database = 'unhealthy';
      errors.push('Database connection failed');
    }
  } catch (e) {
    checks.database = 'unhealthy';
    errors.push('Database connection failed');
  }

  // Check Redis
  try {
    const redisHealthy = await redis.healthCheck();
    if (!redisHealthy) {
      checks.redis = 'unhealthy';
      errors.push('Redis connection failed');
    }
  } catch (e) {
    checks.redis = 'unhealthy';
    errors.push('Redis connection failed');
  }

  // Check Python service (optional - don't fail if unavailable)
  try {
    const pythonHealthy = await curriculumClient.healthCheck();
    if (!pythonHealthy) {
      checks.python_service = 'unhealthy';
    }
  } catch (e) {
    checks.python_service = 'unhealthy';
  }

  // Determine overall status
  const status =
    errors.length === 0
      ? 'healthy'
      : checks.database === 'healthy'
        ? 'degraded'
        : 'unhealthy';

  res.status(status === 'unhealthy' ? 503 : 200).json({
    status,
    service: 'api-node',
    timestamp: new Date().toISOString(),
    dependencies: checks,
    ...(errors.length > 0 && { errors }),
  });
});

// Routes
app.use('/auth', authRoutes);
app.use('/api/plan', planRoutes);
app.use('/api/plan', exerciseRoutes);
app.use('/api', masteryRoutes);
app.use('/admin', adminRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  logger.error({ error: err, requestId }, 'Unhandled error');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    details: {},
    request_id: requestId,
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await redis.close();
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down');
  await redis.close();
  await db.close();
  process.exit(0);
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Node API listening');

  // Start background jobs after server is listening
  startQualitySignalsJob();
});
