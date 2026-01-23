import express from 'express';
import planRoutes from './routes/plan.routes';
import logger from './utils/logger';
import { db } from './db/client';
import { redis } from './db/redis';

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
  const dbHealthy = await db.healthCheck();
  const status = dbHealthy ? 'ok' : 'degraded';
  res.json({
    status,
    service: 'api-node',
    database: dbHealthy ? 'connected' : 'disconnected',
  });
});

// Routes
app.use('/api/plan', planRoutes);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error: err }, 'Unhandled error');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
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
});
