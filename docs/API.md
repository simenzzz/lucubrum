# API.md — API Documentation

## Overview
This document describes all public-facing API endpoints (Node service) and internal LLM service endpoints (Python service).

**Base URLs**:
- Node API (public): `http://localhost:3000/api` (dev) / `https://api.lucubrum.com` (prod)
- Python LLM Service (internal): `http://localhost:8000` (dev) / `http://llm-service:8000` (prod)

**Authentication**: 
- Public API: Bearer token in `Authorization` header (user auth)
- Internal API: Service token in `X-Service-Token` header (Node ↔ Python)

**Common Headers**:
```
Content-Type: application/json
X-Request-ID: <uuid>  (optional, generated if not provided)
```

---

## Public API Endpoints (Node Service)

### POST /api/plan
Generate a learning plan for a topic.

**Request**:
```json
{
  "topic": "Binary Search Trees",
  "user_level": "intermediate",
  "plan_size": "moderate",
  "exercise_types": ["mcq", "short_answer", "coding"],
  "constraints": {
    "time_budget_hours": 10
  }
}
```

**Fields**:
- `topic` (string, required): Topic to learn (3-100 chars)
- `user_level` (string, required): "beginner" | "intermediate" | "advanced"
- `plan_size` (string, optional): Plan scope. Default: "moderate"
  - `"basic"`: 4-12 nodes (quick overview, refresher)
  - `"moderate"`: 12-20 nodes (standard depth)
  - `"large"`: 20-30 nodes (comprehensive deep-dive)
  - `"dynamic"`: 4-30 nodes (LLM decides based on topic complexity)
- `exercise_types` (array, optional): Exercise types to generate. Default: ["mcq", "short_answer"]
- `constraints` (object, optional): Additional constraints
  - `time_budget_hours` (int, optional): Total estimated time budget

**Response** (200 OK):
```json
{
  "plan_id": "550e8400-e29b-41d4-a716-446655440000",
  "plan": {
    "topic": "Binary Search Trees",
    "user_level": "intermediate",
    "plan_size": "moderate",
    "nodes": [
      {
        "id": "bst_introduction",
        "title": "Introduction to Binary Search Trees",
        "objectives": [
          "Understand BST properties",
          "Compare BST with arrays and linked lists"
        ],
        "prerequisites": [],
        "estimated_minutes": 30,
        "tags": ["data_structures", "trees"]
      },
      {
        "id": "bst_insertion",
        "title": "BST Insertion",
        "objectives": ["Implement iterative insertion", "Implement recursive insertion"],
        "prerequisites": ["bst_introduction"],
        "estimated_minutes": 45,
        "tags": ["algorithms", "recursion"]
      }
    ],
    "schedule": [
      {"order": 1, "node_id": "bst_introduction"},
      {"order": 2, "node_id": "bst_insertion"}
    ],
    "metadata": {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "prompt_version": "plan/v2",
      "created_at": "2025-01-06T10:30:00Z"
    }
  }
}
```

**Errors**:
- 400: Invalid input (missing required fields, invalid user_level)
- 500: Plan generation failed (see error details)
- 503: Python service unavailable

---

### POST /api/plan/:planId/resources
Attach YouTube resources to all nodes in a plan.

**Request**: No body required.

**Response** (200 OK):
```json
{
  "resources_by_node": {
    "bst_introduction": [
      {
        "video_id": "pYT9F8_LFTM",
        "title": "Binary Search Trees - Introduction",
        "channel_title": "MIT OpenCourseWare",
        "url": "https://www.youtube.com/watch?v=pYT9F8_LFTM",
        "duration_seconds": 1234,
        "rank_score": 0.95,
        "type": "must_watch",
        "rationale": "Comprehensive introduction from MIT covering core BST properties"
      },
      {
        "video_id": "abc123def45",
        "title": "BST Visualization and Examples",
        "channel_title": "CS Dojo",
        "url": "https://www.youtube.com/watch?v=abc123def45",
        "duration_seconds": 678,
        "rank_score": 0.82,
        "type": "recommended",
        "rationale": "Visual examples helpful for understanding BST structure"
      }
    ],
    "bst_insertion": [...]
  }
}
```

**Errors**:
- 404: Plan not found
- 500: Resource attachment failed
- 503: YouTube API unavailable or quota exceeded

---

### POST /api/plan/:planId/nodes/:nodeId/exercises
Generate exercises for a specific node.

**Request**:
```json
{
  "exercise_types": ["mcq", "short_answer"],
  "count": 5
}
```

**Fields**:
- `exercise_types` (array, optional): Exercise types to generate. Default: user's plan preferences
- `count` (int, optional): Number of exercises per type (default: 5)

**Response** (200 OK):
```json
{
  "exercise_set": {
    "node_id": "bst_insertion",
    "user_level": "intermediate",
    "exercises": [
      {
        "id": "ex_001",
        "type": "mcq",
        "prompt": "What is the time complexity of inserting into a balanced BST?",
        "choices": ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
        "correct_answer": "O(log n)",
        "rubric": "Correct answer is O(log n) because balanced BST has height log(n). Common mistake: confusing with unbalanced BST which is O(n).",
        "difficulty": 2
      },
      {
        "id": "ex_002",
        "type": "short_answer",
        "prompt": "Explain why BST insertion maintains the BST property.",
        "correct_answer": "Insertion compares new value with current node and recursively inserts into left subtree if smaller, right if larger, preserving the property that left < parent < right at every node.",
        "rubric": "Must mention: (1) comparison at each node, (2) recursive descent, (3) preservation of left < parent < right. Award partial credit for 2/3.",
        "difficulty": 3
      }
    ],
    "metadata": {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "prompt_version": "exercises/v1",
      "created_at": "2025-01-06T11:00:00Z"
    }
  }
}
```

**Errors**:
- 404: Plan or node not found
- 400: Invalid exercise types
- 500: Exercise generation failed

---

### POST /api/attempts
Submit and grade a user's answer to an exercise.

**Request**:
```json
{
  "plan_id": "550e8400-e29b-41d4-a716-446655440000",
  "node_id": "bst_insertion",
  "exercise_id": "ex_001",
  "user_answer": "O(log n)"
}
```

**Fields**:
- `plan_id` (string, required): Plan UUID
- `node_id` (string, required): Node ID
- `exercise_id` (string, required): Exercise UUID
- `user_answer` (string | object, required): User's answer (format depends on exercise type)

**Response** (200 OK):
```json
{
  "attempt_id": "att_12345",
  "grade": {
    "exercise_id": "ex_001",
    "score": 1.0,
    "is_correct": true,
    "feedback": "Correct! O(log n) is the time complexity for balanced BST insertion.",
    "misconceptions": []
  },
  "updated_mastery": {
    "node_id": "bst_insertion",
    "mastery_score": 0.75,
    "level": "competent",
    "previous_score": 0.68
  }
}
```

**Errors**:
- 404: Exercise not found
- 400: Invalid answer format
- 500: Grading failed

---

---

### GET /api/plan/:planId
Retrieve a plan by ID.

**Response** (200 OK):
```json
{
  "plan_id": "550e8400-e29b-41d4-a716-446655440000",
  "topic": "Binary Search Trees",
  "user_level": "intermediate",
  "plan_size": "moderate",
  "nodes": [...],
  "schedule": [...],
  "metadata": {...},
  "created_at": "2025-01-06T10:30:00Z"
}
```

**Errors**:
- 404: Plan not found

---

### GET /api/plan/:planId/nodes/:nodeId/mastery
Get user's mastery for a specific node.

**Response** (200 OK):
```json
{
  "node_id": "bst_insertion",
  "mastery_score": 0.75,
  "level": "competent",
  "attempts_count": 12,
  "last_attempt_at": "2025-01-06T14:30:00Z",
  "exercises_completed": 8,
  "average_score": 0.82
}
```

**Errors**:
- 404: Plan or node not found
- 404: No mastery data yet (user hasn't attempted any exercises)

---

### GET /api/plan/:planId/next
Get recommended next node for the user to study.

**Note**: This is a **recommendation system**, not access control. Users can start any node via the regular plan endpoints. This endpoint suggests the optimal next step for UI highlighting.

**Response** (200 OK):
```json
{
  "recommended_node_id": "bst_deletion",
  "rationale": "Continue with \"BST Deletion\" - you're making progress (45% mastery).",
  "current_progress": {
    "nodes_completed": 3,
    "total_nodes": 12,
    "completion_percentage": 25
  },
  "all_prerequisites_met": true
}
```

**Response when all nodes mastered** (200 OK):
```json
{
  "recommended_node_id": null,
  "rationale": "Congratulations! You have mastered all nodes in this plan.",
  "current_progress": {
    "nodes_completed": 12,
    "total_nodes": 12,
    "completion_percentage": 100
  },
  "all_prerequisites_met": true
}
```

**Response when prerequisites not met** (200 OK):
```json
{
  "recommended_node_id": "bst_insertion",
  "rationale": "You need to improve mastery on \"BST Insertion\" before advancing.",
  "current_progress": {
    "nodes_completed": 1,
    "total_nodes": 12,
    "completion_percentage": 8
  },
  "all_prerequisites_met": false
}
```

**Errors**:
- 404: Plan not found

---

### GET /api/users/:userId/plans
List all plans for a user.

**Query Parameters**:
- `status` (string, optional): Filter by status ("in_progress" | "completed")
- `limit` (int, optional): Max results (default: 20, max: 100)
- `offset` (int, optional): Pagination offset (default: 0)

**Response** (200 OK):
```json
{
  "plans": [
    {
      "plan_id": "550e8400-e29b-41d4-a716-446655440000",
      "topic": "Binary Search Trees",
      "user_level": "intermediate",
      "plan_size": "moderate",
      "started_at": "2025-01-06T10:30:00Z",
      "last_accessed_at": "2025-01-07T15:20:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

---

### GET /api/users/:userId/usage
Get tier usage and limits for a user.

**Authorization**: Users can access their own usage. Admin role required to view other users' usage.

**Response** (200 OK):
```json
{
  "tier": "free",
  "usage": {
    "active_plans": {
      "current": 2,
      "limit": 3
    },
    "daily_llm_attempts": {
      "current": 7,
      "limit": 15
    }
  },
  "limits": {
    "allowed_plan_sizes": ["basic", "moderate"],
    "max_exams_per_node": 2,
    "exercise_regenerations": 0,
    "plan_history_days": 30
  }
}
```

**Errors**:
- 403: Forbidden (not own usage, not admin)
- 404: User not found (admin viewing other users)

---

### PUT /admin/users/:userId/tier
Update a user's tier (admin only).

**Authorization**: Admin role required.

**Request**:
```json
{
  "tier": "pro"
}
```

**Fields**:
- `tier` (string, required): "free" or "pro"

**Response** (200 OK):
```json
{
  "user_id": "user-123",
  "tier": "pro",
  "roles": ["user", "pro"],
  "warning": "Role change takes effect on next token refresh (up to 15 minutes)"
}
```

**Errors**:
- 400: Invalid tier value or invalid userId format
- 403: Forbidden (not admin)
- 404: User not found

**Known Limitation**: Active JWTs are not invalidated when tier changes. Users retain their old tier until token expires (max 15 minutes).

---

## Internal API Endpoints (Python LLM Service)

### POST /llm/plan
Generate a learning plan via LLM.

**Request**:
```json
{
  "topic": "Binary Search Trees",
  "user_level": "intermediate",
  "plan_size": "moderate"
}
```

**Fields**:
- `topic` (string, required): Topic to learn (3-100 chars)
- `user_level` (string, required): "beginner" | "intermediate" | "advanced"
- `plan_size` (string, optional): Plan scope. Default: "moderate"
  - `"basic"`: 4-12 nodes
  - `"moderate"`: 12-20 nodes
  - `"large"`: 20-30 nodes
  - `"dynamic"`: LLM decides (4-30 nodes)

**Response** (200 OK):
```json
{
  "plan": {
    "topic": "Binary Search Trees",
    "user_level": "intermediate",
    "plan_size": "moderate",
    "nodes": [...],
    "schedule": [...],
    "metadata": {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "prompt_version": "plan/v2",
      "created_at": "2025-01-06T10:30:00Z"
    }
  }
}
```

**Errors**:
- 400: Invalid input
- 422: Validation error (LLM output failed schema validation after retries)
- 500: LLM provider error
- 503: LLM provider rate limit exceeded

---

### POST /llm/exercises
Generate exercises for a node.

**Request**:
```json
{
  "node": {
    "id": "bst_insertion",
    "title": "BST Insertion",
    "objectives": ["Implement iterative insertion", "Implement recursive insertion"]
  },
  "user_level": "intermediate",
  "exercise_types": ["mcq", "short_answer", "coding"],
  "count": 5,
  "difficulty_target": 3
}
```

**Response** (200 OK):
```json
{
  "exercise_set": {
    "node_id": "bst_insertion",
    "user_level": "intermediate",
    "exercises": [...],
    "metadata": {...}
  }
}
```

**Errors**:
- 400: Invalid input
- 422: Validation error
- 500: LLM provider error

---

### POST /llm/grade
Grade a user's answer.

**Request**:
```json
{
  "exercise": {
    "id": "ex_001",
    "type": "mcq",
    "prompt": "What is the time complexity of inserting into a balanced BST?",
    "correct_answer": "O(log n)",
    "rubric": "..."
  },
  "user_answer": "O(log n)",
  "user_level": "intermediate"
}
```

**Response** (200 OK):
```json
{
  "grade": {
    "exercise_id": "ex_001",
    "score": 1.0,
    "is_correct": true,
    "feedback": "Correct! O(log n) is the time complexity for balanced BST insertion.",
    "misconceptions": []
  },
  "metadata": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "prompt_version": "grading/v1",
    "created_at": "2025-01-06T11:30:00Z"
  }
}
```

**Errors**:
- 400: Invalid input
- 422: Validation error
- 500: LLM provider error

---

### POST /llm/queries
Suggest YouTube search queries for a node.

**Request**:
```json
{
  "node": {
    "id": "bst_insertion",
    "title": "BST Insertion",
    "objectives": ["Implement iterative insertion", "Implement recursive insertion"]
  },
  "count": 3
}
```

**Response** (200 OK):
```json
{
  "queries": [
    "binary search tree insertion tutorial",
    "BST insert algorithm explanation",
    "recursive vs iterative BST insertion"
  ],
  "metadata": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "created_at": "2025-01-06T11:00:00Z"
  }
}
```

**Errors**:
- 400: Invalid input
- 500: LLM provider error

---

### POST /llm/transcript
Fetch the transcript for a YouTube video.

**Request**:
```json
{
  "video_id": "dQw4w9WgXcQ",
  "language": "en"
}
```

**Fields**:
- `video_id` (string, required): 11-character YouTube video ID
- `language` (string, optional): Preferred language code (default: "en")

**Response** (200 OK):
```json
{
  "transcript": {
    "schema_version": "transcript.v1",
    "video_id": "dQw4w9WgXcQ",
    "language": "en",
    "segments": [
      {
        "start_seconds": 0.0,
        "duration_seconds": 4.5,
        "text": "We're no strangers to love"
      }
    ],
    "full_text": "We're no strangers to love...",
    "duration_seconds": 213,
    "fetch_source": "youtube_transcript_api"
  }
}
```

**Errors**:
- 404: Transcript not available (disabled, video unavailable, or no captions)
- 500: Internal error

---

### POST /llm/validate-video
Validate that a video's transcript matches a learning node.

**Request**:
```json
{
  "video_id": "pYT9F8_LFTM",
  "plan_id": "550e8400-e29b-41d4-a716-446655440000",
  "node_id": "bst_introduction",
  "node_title": "Introduction to Binary Search Trees",
  "node_objectives": [
    "Understand BST properties",
    "Compare BST with arrays and linked lists"
  ],
  "transcript_text": "Today we'll learn about binary search trees...",
  "request_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

**Response** (200 OK):
```json
{
  "validation": {
    "schema_version": "video_validation.v1",
    "video_id": "pYT9F8_LFTM",
    "plan_id": "550e8400-e29b-41d4-a716-446655440000",
    "node_id": "bst_introduction",
    "is_relevant": true,
    "relevance_score": 0.85,
    "matched_objectives": ["Understand BST properties"],
    "rejection_reason": null,
    "metadata": {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "prompt_version": "validate_video/v1",
      "created_at": "2025-01-06T10:30:00Z",
      "request_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "raw_output_hash": "abc123...",
      "artifact_hash": "def456...",
      "validation_retry_count": 0
    }
  }
}
```

**Errors**:
- 422: LLM output validation failed
- 500: LLM provider error or internal error

---

### POST /llm/check-staleness
Check if cached plan content is stale compared to current sources.

**Request**:
```json
{
  "cache_key": "sha256hash...",
  "topic": "React State Management",
  "plan_summary": "Topic: React State Management\nLevel: intermediate\nNodes:\n- useState Hook...",
  "resources": [
    {
      "video_id": "abc123def45",
      "title": "React Hooks Tutorial",
      "transcript_excerpt": "In this video we cover useState and useEffect..."
    }
  ],
  "mcp_facts": [
    "React 18 introduces automatic batching for state updates",
    "useEffect cleanup runs before each re-render"
  ],
  "request_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
}
```

**Response** (200 OK):
```json
{
  "result": {
    "schema_version": "staleness_result.v1",
    "cache_key": "sha256hash...",
    "is_stale": false,
    "contradiction_rate": 0.05,
    "stale_reason": null,
    "sources_checked": ["React documentation", "React blog"],
    "contradictions_found": [],
    "metadata": {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "prompt_version": "staleness/v1",
      "created_at": "2025-01-06T10:30:00Z",
      "request_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "raw_output_hash": "abc123...",
      "artifact_hash": "def456...",
      "validation_retry_count": 0
    }
  }
}
```

**Errors**:
- 422: LLM output validation failed
- 500: LLM provider error or internal error

---

### GET /health
Health check endpoint for both services.

**Response** (200 OK):
```json
{
  "status": "healthy",
  "service": "node-api",
  "timestamp": "2025-01-06T15:00:00Z",
  "dependencies": {
    "database": "healthy",
    "python_service": "healthy",
    "youtube_api": "healthy"
  }
}
```

**Response** (503 Service Unavailable):
```json
{
  "status": "unhealthy",
  "service": "node-api",
  "timestamp": "2025-01-06T15:00:00Z",
  "dependencies": {
    "database": "healthy",
    "python_service": "unhealthy",
    "youtube_api": "healthy"
  },
  "errors": [
    "Python LLM service not responding"
  ]
}
```

---

## Error Response Format

All errors follow this structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "field": "specific_field",
    "reason": "why it failed"
  },
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

### Common Error Codes

#### 4xx Client Errors
- `INVALID_INPUT`: Missing or malformed request fields
- `INVALID_EXERCISE_TYPE`: Unsupported exercise type
- `PLAN_NOT_FOUND`: Plan ID doesn't exist
- `NODE_NOT_FOUND`: Node ID doesn't exist in plan
- `EXERCISE_NOT_FOUND`: Exercise ID doesn't exist
- `UNAUTHORIZED`: Missing or invalid auth token
- `TIER_LIMIT_EXCEEDED`: Free tier limit reached (see details for specific limit)

#### 5xx Server Errors
- `PLAN_GENERATION_FAILED`: Unable to generate valid plan
- `EXERCISE_GENERATION_FAILED`: Unable to generate exercises
- `GRADING_FAILED`: Unable to grade answer
- `VALIDATION_FAILED`: LLM output failed schema validation
- `CURRICULUM_SERVICE_UNAVAILABLE`: Python service not responding
- `YOUTUBE_API_UNAVAILABLE`: YouTube API error or quota exceeded
- `DATABASE_ERROR`: Database query failed
- `INTERNAL_ERROR`: Unexpected server error

---

## Rate Limits

### Public API (Node Service)
- **Per User**: 100 requests / hour (general)
- **Plan Creation**: 10 requests / hour
- **Exercise Generation**: 50 requests / hour
- **Grading**: 200 requests / hour

### Tier-Based Enforcement
In addition to rate limits, free-tier users have quota-based enforcement on specific operations (see `docs/TIERS.md`):
- **Active Plans**: Max 3 concurrent plans
- **Daily LLM Attempts**: 15 per day (resets at midnight UTC)
- **Exams Per Node**: 2 attempts
- **Exercise Regeneration**: Disabled for free tier
- **Plan Sizes**: Limited to `basic` and `moderate`

Tier enforcement returns `403 TIER_LIMIT_EXCEEDED` (not 429). Pro users bypass all tier limits.

### Internal API (Python Service)
- **No user-level limits** (called by Node service only)
- **LLM Provider Limits**: Enforced by provider (Gemini: 60 RPM, Claude: varies by plan)

---

## Authentication

### Public API (User Auth)
```http
Authorization: Bearer <user_jwt_token>
```

JWT claims:
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "roles": ["user"],
  "jti": "unique-token-id",
  "type": "access",
  "iat": 1736171100,
  "exp": 1736172000
}
```

Notes:
- `roles`: Array of role strings. Default: `["user"]`. Admins have `["user", "admin"]`.
- `jti`: Unique token identifier used for blacklisting on logout.
- `type`: Token type (`"access"` or `"refresh"`).

### Internal API (Service Auth)
```http
X-Service-Token: <internal_service_token>
```

Token is static, configured via environment variable, rotated periodically.

---

## Pagination

List endpoints support pagination via query parameters:

```
GET /api/users/:userId/plans?limit=20&offset=40
```

Response includes pagination metadata:
```json
{
  "plans": [...],
  "total": 150,
  "limit": 20,
  "offset": 40,
  "has_more": true
}
```

---

## Versioning

API version is included in the path:

```
/api/v1/plan
/api/v1/plan/:planId/resources
```

Current version: `v1`

Breaking changes require a new version (`v2`). Non-breaking changes (new optional fields) can be added to existing version.

---

## WebSocket API (Future)

For real-time updates (e.g., plan generation progress):

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.send(JSON.stringify({
  type: 'subscribe',
  resource: 'plan',
  plan_id: '550e8400-e29b-41d4-a716-446655440000'
}));

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // msg.type: 'progress' | 'complete' | 'error'
};
```

Not implemented in MVP.