import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockWarmUp = jest.fn();
const mockNormalizeTopic = jest.fn();
const mockGetJSON = jest.fn();
const mockUpsertUserPlan = jest.fn();
const mockPreloadNodeResources = jest.fn();
let MockCurriculumServiceError: new (
  message: string,
  statusCode: number,
  errorCode: string,
  details?: Record<string, unknown>
) => Error;

jest.mock('../../../src/middleware/auth.middleware', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    _req.user = {
      user_id: 'test-user-123',
      email: 'test@example.com',
      roles: ['user', 'pro'],
      jti: 'test-jti',
      exp: Math.floor(Date.now() / 1000) + 900,
    };
    next();
  },
}));

jest.mock('../../../src/middleware/rate-limit.middleware', () => ({
  rateLimit: {
    planCreation: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
    general: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  },
}));

jest.mock('../../../src/middleware/tier.middleware', () => ({
  enforcePlanLimit: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  enforcePlanSize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../../../src/services/curriculum-client', () => ({
  curriculumClient: {
    warmUp: mockWarmUp,
    normalizeTopic: mockNormalizeTopic,
    getFacts: jest.fn(),
  },
  CurriculumServiceError: class CurriculumServiceError extends Error {
    constructor(
      message: string,
      public statusCode: number,
      public errorCode: string,
      public details?: Record<string, unknown>
    ) {
      super(message);
      this.name = 'CurriculumServiceError';
    }
  },
}));

jest.mock('../../../src/services/plan.service', () => ({
  planService: {
    createPlan: jest.fn(),
    getPlan: jest.fn(),
    getUserPlans: jest.fn(),
  },
  PlanServiceError: class PlanServiceError extends Error {
    constructor(
      message: string,
      public code: string,
      public statusCode: number,
      public details?: Record<string, unknown>
    ) {
      super(message);
      this.name = 'PlanServiceError';
    }
  },
}));

jest.mock('../../../src/db/redis', () => ({
  __esModule: true,
  default: {
    getJSON: mockGetJSON,
    setJSON: jest.fn(),
  },
  redis: {
    close: jest.fn(),
  },
}));

jest.mock('../../../src/db/queries/user-plans', () => ({
  upsertUserPlan: mockUpsertUserPlan,
}));

jest.mock('../../../src/services/learn.service', () => ({
  getNodeLearnContent: jest.fn(),
  getInitiallyUnlockedNodeIds: jest.fn(() => ['intro']),
  getDepth1NeighborIds: jest.fn(() => []),
  preloadNodeResources: mockPreloadNodeResources,
  nodeRowsToLearningNodes: jest.fn((nodes) => nodes),
}));

jest.mock('../../../src/services/youtube.service', () => ({
  youtubeService: {},
}));

jest.mock('../../../src/db/queries/plans', () => ({
  getPlanWithNodes: jest.fn(),
}));

jest.mock('../../../src/db/queries/resources', () => ({
  insertResourcesForNode: jest.fn(),
  hasResourcesForNode: jest.fn(),
  getResourcesForPlan: jest.fn(),
  getNodeResourceStatusBatch: jest.fn(),
}));

describe('plan routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWarmUp.mockResolvedValue(undefined as never);
    mockNormalizeTopic.mockResolvedValue({
      topic_normalized: 'javascript_basics',
      domain_category: 'web',
      staleness_policy: '30d',
      metadata: {},
    } as never);
    mockGetJSON.mockResolvedValue({
      plan_id: 'cached-plan-123',
      plan: {
        schema_version: 'plan.v1',
        topic: 'JavaScript Basics',
        user_level: 'beginner',
        plan_size: 'basic',
        nodes: [
          {
            node_id: 'intro',
            title: 'Intro',
            objectives: ['Understand basics'],
            prerequisites: [],
            estimated_minutes: 30,
          },
        ],
        schedule: [{ order: 1, node_id: 'intro' }],
        metadata: {},
      },
      topic_normalized: 'javascript_basics',
      domain_category: 'web',
      staleness_policy: '30d',
      factSnapshot: [],
      created_at: new Date().toISOString(),
    } as never);
    mockUpsertUserPlan.mockResolvedValue(undefined as never);
    mockPreloadNodeResources.mockResolvedValue(undefined as never);
  });

  it('warms up curriculum service before topic normalization', async () => {
    const { default: planRoutes } = await import('../../../src/routes/plan.routes');
    const app = express();
    app.use(express.json());
    app.use('/api/plan', planRoutes);

    await request(app)
      .post('/api/plan')
      .set('X-Request-ID', 'route-request-123')
      .send({
        topic: 'JavaScript Basics',
        user_level: 'beginner',
        plan_size: 'basic',
      })
      .expect(201);

    expect(mockWarmUp).toHaveBeenCalledWith('route-request-123');
    expect(mockNormalizeTopic).toHaveBeenCalledWith({
      topic: 'JavaScript Basics',
      request_id: 'route-request-123',
    });
    expect(mockWarmUp.mock.invocationCallOrder[0]).toBeLessThan(
      mockNormalizeTopic.mock.invocationCallOrder[0]
    );
  });

  it('returns Retry-After without leaking upstream diagnostics when warm-up is rate-limited', async () => {
    const curriculumModule = await import('../../../src/services/curriculum-client');
    MockCurriculumServiceError = curriculumModule.CurriculumServiceError;
    mockWarmUp.mockRejectedValue(
      new MockCurriculumServiceError(
        'Curriculum generation is temporarily rate-limited upstream. Please try again shortly.',
        503,
        'CURRICULUM_SERVICE_RATE_LIMITED',
        {
          retry_after: '45',
          upstream_status: 429,
          upstream_url: '/health',
          cf_ray: 'warmup-ray',
          content_type: 'text/plain',
          last_message: 'Request failed with status code 429',
        }
      ) as never
    );

    const { default: planRoutes } = await import('../../../src/routes/plan.routes');
    const app = express();
    app.use(express.json());
    app.use('/api/plan', planRoutes);

    const response = await request(app)
      .post('/api/plan')
      .set('X-Request-ID', 'route-request-429')
      .send({
        topic: 'JavaScript Basics',
        user_level: 'beginner',
        plan_size: 'basic',
      })
      .expect(503);

    expect(response.headers['retry-after']).toBe('45');
    expect(response.body).toEqual({
      error: 'CURRICULUM_SERVICE_RATE_LIMITED',
      message: 'Curriculum generation is temporarily rate-limited upstream. Please try again shortly.',
      details: { retry_after: '45' },
      request_id: 'route-request-429',
    });
    expect(mockNormalizeTopic).not.toHaveBeenCalled();
  });
});
