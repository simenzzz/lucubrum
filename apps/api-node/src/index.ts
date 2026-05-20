import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import planRoutes from './routes/plan.routes';
import authRoutes from './routes/auth.routes';
import exerciseRoutes from './routes/exercise.routes';
import examRoutes from './routes/exam.routes';
import masteryRoutes from './routes/mastery.routes';
import adminRoutes from './routes/admin.routes';
import userRoutes from './routes/user.routes';
import logger from './utils/logger';
import { db } from './db/client';
import { redis } from './db/redis';
import { curriculumClient } from './services/curriculum-client';
import { startQualitySignalsJob } from './jobs/quality-signals';
import { csrfProtection } from './middleware/csrf.middleware';
import { rateLimit } from './middleware/rate-limit.middleware';

const app = express();
const PORT = process.env.PORT || 3000;

// Configure trust proxy for correct client IP detection
// This is required when running behind a reverse proxy (nginx)
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Validate CORS_ORIGIN at startup
function validateCorsOrigin(): void {
  // CORS_ORIGIN must not be '*' with cookie-based auth
  if (CORS_ORIGIN === '*') {
    throw new Error(
      'CORS_ORIGIN cannot be "*" with cookie-based authentication. ' +
      'Set it to a specific origin (e.g., "http://localhost:5173" or "https://app.example.com").'
    );
  }

  // Validate it's a proper URL
  try {
    const parsed = new URL(CORS_ORIGIN);
    // Only allow http(s) protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(
        `CORS_ORIGIN must use http or https protocol. Got: "${parsed.protocol}"`
      );
    }

    // Warn if using localhost in production
    if (NODE_ENV === 'production' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      logger.warn(
        { corsOrigin: CORS_ORIGIN },
        'CORS_ORIGIN is set to localhost in production environment'
      );
    }

    logger.info({ corsOrigin: CORS_ORIGIN }, 'CORS_ORIGIN validated');
  } catch (error) {
    if ((error as Error).message.includes('CORS_ORIGIN')) {
      throw error; // Re-throw our custom errors
    }
    throw new Error(
      `CORS_ORIGIN is not a valid URL: "${CORS_ORIGIN}". ` +
      `Expected format: "http://localhost:5173" or "https://app.example.com"`
    );
  }
}

// Validate configuration at startup
validateCorsOrigin();

// Validate required environment variables at startup
function validateRequiredEnvVars(): void {
  const requiredEnvVars = [
    'JWT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'POSTGRES_HOST',
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'REDIS_URL',
    'SERVICE_TOKEN',
    'YOUTUBE_API_KEY',
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  // Facebook OAuth: if any FB env var is set, require all three
  const fbVars = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_REDIRECT_URI'];
  const fbSet = fbVars.filter(key => process.env[key]);
  if (fbSet.length > 0 && fbSet.length < fbVars.length) {
    const fbMissing = fbVars.filter(key => !process.env[key]);
    throw new Error(
      `Partial Facebook OAuth configuration. Set all or none: missing ${fbMissing.join(', ')}`
    );
  }

  logger.info('All required environment variables validated');
}

validateRequiredEnvVars();

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "https://i.ytimg.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://www.facebook.com", "https://graph.facebook.com"],
      frameSrc: ["'none'"],
    },
  },
}));

// CORS configuration for cookie-based auth
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  // No Authorization header - using HTTP-only cookies for auth
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// CSRF protection for state-changing requests
// Must come after cookie parser, before route handlers
app.use(csrfProtection);

// Request logging middleware
app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, 'Incoming request');
  next();
});

// Health check
app.get('/health', rateLimit.healthIP(), async (_req, res) => {
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
app.use('/api/plan', examRoutes);
app.use('/api', masteryRoutes);
app.use('/api/users', userRoutes);
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
