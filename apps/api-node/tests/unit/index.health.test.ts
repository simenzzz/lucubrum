import request from 'supertest';
import { jest } from '@jest/globals';

const mockDbHealthCheck = jest.fn();
const mockRedisHealthCheck = jest.fn();
const mockCurriculumHealthCheck = jest.fn();

process.env.GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/oauth/callback';
process.env.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'test-youtube-api-key';

jest.mock('../../src/db/client', () => ({
  db: {
    healthCheck: mockDbHealthCheck,
    close: jest.fn(),
  },
}));

jest.mock('../../src/db/redis', () => ({
  __esModule: true,
  default: {
    healthCheck: mockRedisHealthCheck,
    close: jest.fn(),
  },
  redis: {
    healthCheck: mockRedisHealthCheck,
    close: jest.fn(),
  },
}));

jest.mock('../../src/services/curriculum-client', () => ({
  curriculumClient: {
    healthCheck: mockCurriculumHealthCheck,
  },
}));

jest.mock('../../src/jobs/quality-signals', () => ({
  startQualitySignalsJob: jest.fn(),
}));

jest.mock('../../src/middleware/rate-limit.middleware', () => ({
  rateLimit: {
    healthIP: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
}));

jest.mock('../../src/routes/plan.routes', () => ({
  __esModule: true,
  default: jest.requireActual<typeof import('express')>('express').Router(),
}));

jest.mock('../../src/routes/auth.routes', () => ({
  __esModule: true,
  default: jest.requireActual<typeof import('express')>('express').Router(),
}));

jest.mock('../../src/routes/exercise.routes', () => ({
  __esModule: true,
  default: jest.requireActual<typeof import('express')>('express').Router(),
}));

jest.mock('../../src/routes/exam.routes', () => ({
  __esModule: true,
  default: jest.requireActual<typeof import('express')>('express').Router(),
}));

jest.mock('../../src/routes/mastery.routes', () => ({
  __esModule: true,
  default: jest.requireActual<typeof import('express')>('express').Router(),
}));

jest.mock('../../src/routes/admin.routes', () => ({
  __esModule: true,
  default: jest.requireActual<typeof import('express')>('express').Router(),
}));

jest.mock('../../src/routes/user.routes', () => ({
  __esModule: true,
  default: jest.requireActual<typeof import('express')>('express').Router(),
}));

describe('health endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbHealthCheck.mockResolvedValue(true as never);
    mockRedisHealthCheck.mockResolvedValue(true as never);
    mockCurriculumHealthCheck.mockResolvedValue(true as never);
  });

  it('uses /health for dependency diagnostics', async () => {
    const { default: app } = await import('../../src/index');

    const response = await request(app).get('/health').expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'healthy',
        service: 'api-node',
        dependencies: {
          database: 'healthy',
          redis: 'healthy',
          python_service: 'healthy',
        },
      })
    );
    expect(mockDbHealthCheck).toHaveBeenCalledTimes(1);
    expect(mockRedisHealthCheck).toHaveBeenCalledTimes(1);
    expect(mockCurriculumHealthCheck).toHaveBeenCalledTimes(1);
  });
});
