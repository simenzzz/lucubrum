# Phase 4: Exercises & Grading Implementation Plan

> **Goal**: Generate exercises for nodes and grade user answers with mastery tracking.
>
> **Skills Required**: `/curriculum-skill` (Python tasks), `/orchestrator-skill` (Node tasks)

---

## Overview

Phase 4 builds on the completed plan generation and authentication infrastructure to add:
1. Web search for existing exercises (inspiration, not copying)
2. LLM-generated original exercises for each curriculum node
3. LLM-graded user answers with feedback (including coding via rubric)
4. Mastery tracking and progression

**Key Design Decision**: Before generating exercises, the LLM MUST search for existing free exercises online, take inspiration from them, and create original exercises (no copy-paste for copyright reasons).

**Search API**: Google Custom Search API (100 free queries/day)
- **TODO (Phase 7)**: Migrate to MCP tool after Phase 7 MCP integration

---

## Critical Files to Modify

### Python Service (`apps/curriculum-python/`)
| File | Task | Status |
|------|------|--------|
| `src/prompts/exercises/v1.txt` | 4.1 | Create |
| `src/api/exercises.py` | 4.2 | Create |
| `src/prompts/grade/v1.txt` | 4.3 | Create |
| `src/api/grade.py` | 4.4 | Create |
| `src/utils/web_search.py` | 4.1a | Create (new) |
| `src/main.py` | - | Wire routers |

### Node Service (`apps/api-node/`)
| File | Task | Status |
|------|------|--------|
| `src/db/queries/exercises.ts` | 4.9 | Create |
| `src/db/queries/mastery.ts` | 4.10 | Create |
| `src/services/exercise.service.ts` | 4.5 | Implement |
| `src/services/mastery.service.ts` | 4.6 | Implement |
| `src/services/curriculum-client.ts` | - | Add methods |
| `src/routes/exercise.routes.ts` | 4.7 | Implement |
| `src/routes/mastery.routes.ts` | 4.8 | Implement |
| `src/validation/schemas.ts` | - | Add Zod schemas |
| `src/index.ts` | - | Wire routes |

### Documentation
| File | Change |
|------|--------|
| `docs/implementation_roadmap.md` | Add Phase 7 note about MCP migration files |

---

## Implementation Tasks

### Task 4.1a: Web Search Utility (NEW)
**File**: `apps/curriculum-python/src/utils/web_search.py`

**Skill**: `/curriculum-skill`

```python
"""
Web search utility for finding existing exercises.

TODO (Phase 7 MCP Migration):
- Replace Google Custom Search API with MCP web search tool
- Update exercise generation to use MCP tool calls instead
- See: src/api/exercises.py
"""

import httpx
from typing import list

async def search_exercises(
    topic: str,
    exercise_type: str,
    max_results: int = 5
) -> list[dict]:
    """
    Search for existing exercises on a topic using Google Custom Search API.

    Returns list of {title, snippet, url} for inspiration (NOT for copying).
    """
    # Implementation uses GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX env vars
    ...
```

**Environment Variables Needed**:
```env
GOOGLE_CSE_API_KEY=<from Google Cloud Console>
GOOGLE_CSE_CX=<Custom Search Engine ID>
```

---

### Task 4.1: Exercise Prompt Template
**File**: `apps/curriculum-python/src/prompts/exercises/v1.txt`

**Skill**: `/curriculum-skill`

**Key Requirement**: Prompt MUST instruct LLM to use search results for inspiration, not copying.

```
You are an expert educator creating ORIGINAL exercises for a learning platform.

## Node Information
Title: {node_title}
Learning Objectives: {node_objectives}
User Level: {user_level}
Difficulty Target: {difficulty_target}

## Existing Exercises for Inspiration
The following are examples of exercises found online for similar topics.
Use these ONLY as inspiration - DO NOT copy them directly (copyright).
Create your own ORIGINAL exercises that test the same concepts differently.

{search_results}

## Task
Generate {count} ORIGINAL exercises of the following types: {exercise_types}

IMPORTANT:
- Take inspiration from the examples above but create NEW, ORIGINAL content
- Use different wording, scenarios, and examples than the search results
- Ensure exercises are pedagogically sound and test the learning objectives

## Output Schema
{schema_json}

## Constraints
1. Each exercise must test ONE learning objective
2. MCQ: Exactly 4 choices, correct_answer must match one choice exactly
3. All exercise IDs must be unique (format: ex_<type>_<3chars>)
4. Difficulty must be 1-5, centered around {difficulty_target}
5. Rubrics must be 20-500 chars, explaining grading criteria
6. For coding exercises: include reference solution and 3-10 test cases

## Quality Guidelines
GOOD: Original prompts, clear language, plausible distractors, specific rubrics
BAD: Copied content, trick questions, ambiguous wording, vague rubrics

Return ONLY valid JSON.

{validation_errors}
```

**Temperature**: 0.8 (creative variety)
**Max Tokens**: 4096

---

### Task 4.2: POST /llm/exercises Endpoint
**File**: `apps/curriculum-python/src/api/exercises.py`

**Skill**: `/curriculum-skill`

**Flow**:
1. **Search for existing exercises** using `web_search.search_exercises()`
2. Load prompt template with search results injected
3. Define generate_fn with temperature=0.8, max_tokens=4096
4. Create `RawExerciseSetOutput` intermediate model
5. Call `retry_llm_with_validation` with max_retries=2
6. Compute hashes, build metadata
7. Return `GenerateExercisesResponse`

```python
"""
Exercise generation endpoint.

TODO (Phase 7 MCP Migration):
- Replace web_search.search_exercises() with MCP tool call
- The MCP tool should be called BEFORE LLM generation
- Update prompt to reference MCP tool results
"""

@router.post("/exercises", response_model=GenerateExercisesResponse)
async def generate_exercises(request: GenerateExercisesRequest) -> GenerateExercisesResponse:
    # Step 1: Search for existing exercises (inspiration only)
    search_results = await search_exercises(
        topic=request.node_title,
        exercise_type=request.exercise_types[0] if request.exercise_types else "practice problems",
        max_results=5
    )

    # Step 2: Format search results for prompt
    formatted_results = format_search_results(search_results)

    # Step 3: Load prompt and inject search results
    prompt_template = load_prompt("exercises", "v1")
    # ... rest follows plan.py pattern
```

**Request Model**:
```python
class GenerateExercisesRequest(BaseModel):
    plan_id: UUID
    node_id: str
    node_title: str
    node_objectives: list[str]
    user_level: Literal["beginner", "intermediate", "advanced"]
    exercise_types: list[Literal["mcq", "short_answer", "fill_blank", "coding", "flashcard"]] = ["mcq", "short_answer"]
    count: int = Field(default=5, ge=1, le=20)
    difficulty_target: int = Field(default=3, ge=1, le=5)
    request_id: UUID
```

---

### Task 4.3: Grade Prompt Template
**File**: `apps/curriculum-python/src/prompts/grade/v1.txt`

**Skill**: `/curriculum-skill`

```
You are an expert grader for an educational platform.

## Exercise
Type: {exercise_type}
Prompt: {prompt}
Correct Answer: {correct_answer}
Grading Rubric: {rubric}

## User Information
Level: {user_level}

## User's Answer
{user_answer}

## Task
Grade the answer and provide constructive feedback.

## Grading Rules
1. score: 0.0 to 1.0 (partial credit allowed for partial understanding)
2. HARD RULE: score >= 0.7 means is_correct = true
3. HARD RULE: score < 0.5 means is_correct = false
4. For 0.5 <= score < 0.7: use judgment based on rubric
5. feedback: 20-300 chars, constructive, specific, encouraging
6. misconceptions: list specific conceptual gaps (or empty array if none)

## Coding Exercise Grading (if type = "coding")
- Grade based on rubric and reference solution
- Check logical correctness, not syntax perfection
- Award partial credit for correct approach with minor errors
- Note: Code is NOT executed, grade based on reading the code

## Output Schema
{schema_json}

Return ONLY valid JSON.

{validation_errors}
```

**Temperature**: 0.3 (deterministic, consistent)
**Max Tokens**: 2048

---

### Task 4.4: POST /llm/grade Endpoint
**File**: `apps/curriculum-python/src/api/grade.py`

**Skill**: `/curriculum-skill`

**Flow**:
1. Load prompt template
2. **MCQ optimization**: If `exercise_type == "mcq"`, grade locally (no LLM call)
3. For other types: call LLM with temperature=0.3
4. Validate response, build metadata
5. Return Grade

```python
@router.post("/grade", response_model=GradeResponse)
async def grade_answer(request: GradeRequest) -> GradeResponse:
    # MCQ optimization: no LLM needed
    if request.exercise_type == "mcq":
        is_correct = request.user_answer == request.correct_answer
        return GradeResponse(grade=Grade(
            score=1.0 if is_correct else 0.0,
            is_correct=is_correct,
            feedback="Correct!" if is_correct else f"The correct answer was: {request.correct_answer}",
            misconceptions=[],
            metadata=build_local_metadata(request.request_id)
        ))

    # Other types: use LLM
    # ... follows plan.py pattern
```

---

### Task 4.9: Exercise Database Queries
**File**: `apps/api-node/src/db/queries/exercises.ts`

**Skill**: `/orchestrator-skill`

```typescript
// Insert exercises for a node (transaction)
export async function insertExercises(
  planId: string,
  nodeId: string,
  exercises: ExerciseInput[]
): Promise<{ exercise_ids: string[] }>

// Get exercises for a node
export async function getExercisesForNode(
  planId: string,
  nodeId: string,
  options?: { types?: string[], difficulty?: number }
): Promise<ExerciseRow[]>

// Get single exercise by ID
export async function getExerciseById(
  exerciseId: string
): Promise<ExerciseRow | null>
```

---

### Task 4.10: Mastery Database Queries
**File**: `apps/api-node/src/db/queries/mastery.ts`

**Skill**: `/orchestrator-skill`

```typescript
// Insert an attempt
export async function insertAttempt(
  userId: string,
  exerciseId: string,
  attempt: AttemptInput
): Promise<{ attempt_id: string }>

// Get recent attempts for mastery calculation
export async function getRecentAttempts(
  userId: string,
  planId: string,
  nodeId: string,
  limit?: number = 10
): Promise<AttemptRow[]>

// Upsert mastery score
export async function upsertMastery(
  userId: string,
  planId: string,
  nodeId: string,
  masteryScore: number
): Promise<void>

// Get mastery for node
export async function getMastery(
  userId: string,
  planId: string,
  nodeId: string
): Promise<MasteryRow | null>
```

---

### Task 4.5: Exercise Service
**File**: `apps/api-node/src/services/exercise.service.ts`

**Skill**: `/orchestrator-skill`

```typescript
class ExerciseService {
  /**
   * Generate exercises for a node
   * 1. Fetch node details
   * 2. Call Python /llm/exercises (includes web search internally)
   * 3. Validate with AJV
   * 4. Persist to database
   */
  async generateExercises(request, requestId): Promise<GenerateExercisesResult>

  /**
   * Get existing exercises for a node
   */
  async getExercises(planId, nodeId): Promise<ExerciseRow[]>
}

export const exerciseService = new ExerciseService();
```

**Update `curriculum-client.ts`**: Add `generateExercises()` method.

---

### Task 4.6: Mastery Service
**File**: `apps/api-node/src/services/mastery.service.ts`

**Skill**: `/orchestrator-skill`

```typescript
class MasteryService {
  /**
   * Submit answer and grade
   * 1. Fetch exercise
   * 2. Call Python /llm/grade
   * 3. Persist attempt
   * 4. Recalculate mastery
   * 5. Update mastery in DB
   */
  async submitAttempt(userId, request, requestId): Promise<SubmitAttemptResult>

  /**
   * Mastery calculation:
   * recent_accuracy * 0.6 + historical_accuracy * 0.3 + difficulty_bonus * 0.1
   */
  calculateMastery(recentAttempts, allAttempts, maxDifficulty): number

  /**
   * Map score to level: novice < 0.3 < intermediate < 0.6 < competent < 0.8 < expert
   */
  masteryToLevel(score): MasteryLevel
}

export const masteryService = new MasteryService();
```

**Update `curriculum-client.ts`**: Add `gradeAnswer()` method.

---

### Task 4.7: Exercise Routes
**File**: `apps/api-node/src/routes/exercise.routes.ts`

**Skill**: `/orchestrator-skill`

```typescript
router.use(requireAuth);

// POST /api/plan/:planId/nodes/:nodeId/exercises - Generate exercises
router.post('/plan/:planId/nodes/:nodeId/exercises', ...)

// GET /api/plan/:planId/nodes/:nodeId/exercises - Get existing exercises
router.get('/plan/:planId/nodes/:nodeId/exercises', ...)
```

---

### Task 4.8: Mastery Routes
**File**: `apps/api-node/src/routes/mastery.routes.ts`

**Skill**: `/orchestrator-skill`

```typescript
router.use(requireAuth);

// POST /api/attempts - Submit and grade answer
router.post('/attempts', ...)

// GET /api/plan/:planId/nodes/:nodeId/mastery - Get node mastery
router.get('/plan/:planId/nodes/:nodeId/mastery', ...)

// GET /api/plan/:planId/mastery - Get plan-wide mastery overview
router.get('/plan/:planId/mastery', ...)
```

---

## Roadmap Update Required

Add this note to **Phase 7** section in `docs/implementation_roadmap.md`:

```markdown
### MCP Migration Note (from Phase 4)
After completing Phase 7 MCP integration, revisit these files to migrate from direct API calls to MCP tools:
- `apps/curriculum-python/src/utils/web_search.py` - Replace Google CSE with MCP web search
- `apps/curriculum-python/src/api/exercises.py` - Update to use MCP tool calls
- Look for `TODO (Phase 7 MCP Migration)` comments in the codebase
```

---

## Implementation Order

1. **4.1a** Web search utility (Python) - `/curriculum-skill`
2. **4.1** Exercise prompt (Python) - `/curriculum-skill`
3. **4.2** Exercises endpoint (Python) - `/curriculum-skill`
4. **4.3** Grade prompt (Python) - `/curriculum-skill`
5. **4.4** Grade endpoint (Python) - `/curriculum-skill`
6. **4.9** Exercise queries (Node) - `/orchestrator-skill`
7. **4.10** Mastery queries (Node) - `/orchestrator-skill`
8. **4.5** Exercise service (Node) - `/orchestrator-skill`
9. **4.6** Mastery service (Node) - `/orchestrator-skill`
10. **4.7** Exercise routes (Node) - `/orchestrator-skill`
11. **4.8** Mastery routes (Node) - `/orchestrator-skill`
12. Wire routers in `main.py` and `index.ts`
13. Update roadmap with Phase 7 MCP note

---

## Verification

```bash
# 1. Generate exercises (triggers web search + LLM)
curl -X POST http://localhost:3000/api/plan/<planId>/nodes/<nodeId>/exercises \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"exercise_types": ["mcq", "short_answer"], "count": 5}'

# 2. Submit MCQ answer (local grading, no LLM)
curl -X POST http://localhost:3000/api/attempts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"plan_id": "<id>", "node_id": "<id>", "exercise_id": "<id>", "user_answer": "O(log n)"}'

# 3. Check mastery updated
curl http://localhost:3000/api/plan/<planId>/nodes/<nodeId>/mastery \
  -H "Authorization: Bearer <token>"

# 4. Verify database
psql -c "SELECT exercise_id, type FROM exercises WHERE plan_id = '<id>' LIMIT 5;"
psql -c "SELECT mastery_score FROM user_mastery WHERE plan_id = '<id>';"
```

---

## Exit Criteria

- [ ] Exercises endpoint searches web for inspiration before generating
- [ ] Generated exercises are original (not copied from search results)
- [ ] All 5 exercise types supported (mcq, short_answer, fill_blank, coding, flashcard)
- [ ] Coding exercises graded via rubric (no code execution)
- [ ] MCQ graded locally without LLM call
- [ ] Mastery updates after each attempt
- [ ] All endpoints protected with auth
- [ ] TODO comments added for Phase 7 MCP migration
- [ ] Phase 7 roadmap updated with migration note
