// API request/response types matching the backend contracts

// Auth types
export interface GoogleAuthRequest {
  redirect_uri?: string;
}

/** Provider-agnostic OAuth initiation response (Google, Facebook) */
export interface OAuthInitResponse {
  authorization_url: string;
  state: string;
}

export interface EmailRegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface EmailLoginRequest {
  email: string;
  password: string;
}

export interface AuthCallbackRequest {
  code: string;
  state: string;
}

export interface AuthCallbackResponse {
  user: User;
  authenticated: boolean;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  roles: string[];
  created_at: string;
}

// Plan types
export interface CreatePlanRequest {
  topic: string;
  user_level: 'beginner' | 'intermediate' | 'advanced';
  plan_size?: 'basic' | 'moderate' | 'large' | 'dynamic';
}

export interface CreatePlanResponse {
  plan_id: string;
  topic: string;
  user_level: string;
  plan_size: string;
  nodes: PlanNode[];
  schedule: ScheduleItem[];
  metadata: ArtifactMetadata;
}

export interface PlanNode {
  node_id: string;
  title: string;
  objectives: string[];
  estimated_minutes: number;
  prerequisites: string[];
  tags?: string[] | null;
}

export interface ScheduleItem {
  node_id: string;
  order: number;
}

export interface ArtifactMetadata {
  request_id: string;
  prompt_version: string;
  provider: string;
  model: string;
  created_at: string;
  raw_output_hash: string;
  artifact_hash: string;
  validation_retry_count: number;
}

// Exercise types
export interface GenerateExercisesRequest {
  difficulty_target?: 1 | 2 | 3 | 4 | 5;
  force?: boolean;
}

export interface ExerciseSetResponse {
  node_id: string;
  exercises: Exercise[];
  cached?: boolean;
}

export type Exercise = MCQExercise | ShortAnswerExercise | FillBlankExercise | CodingExercise | FlashcardExercise;

export interface BaseExercise {
  id: string;
  node_id: string;
  type: 'mcq' | 'short_answer' | 'fill_blank' | 'coding' | 'flashcard';
  prompt: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  rubric: string;
  choices: string[] | null;
}

export interface MCQExercise extends BaseExercise {
  type: 'mcq';
  correct_answer: string;
}

export interface ShortAnswerExercise extends BaseExercise {
  type: 'short_answer';
  correct_answer: string;
}

export interface FillBlankExercise extends BaseExercise {
  type: 'fill_blank';
  correct_answer: {
    answers: string[];
    match: 'case_sensitive' | 'case_insensitive';
    normalize_whitespace: boolean;
  };
}

export interface CodingExercise extends BaseExercise {
  type: 'coding';
  correct_answer: {
    language: string;
    solution: string;
    test_cases: Array<{ input: unknown; output: unknown }>;
  };
}

export interface FlashcardExercise extends BaseExercise {
  type: 'flashcard';
  correct_answer: string;
}

// Exam exercise returned from start (answers stripped for security)
export interface ExamExercise {
  id: string;
  type: 'mcq' | 'short_answer' | 'fill_blank' | 'coding' | 'flashcard';
  prompt: string;
  difficulty: number;
  choices?: string[] | null;
}

export interface StartExamResult {
  session_id: string;
  exercises: ExamExercise[];
  exam_difficulty: number;
  time_limit_seconds: number;
  started_at: string;
  expires_at: string;
}

export interface ExamAnswer {
  exercise_id: string;
  user_answer: string | string[] | Record<string, unknown>;
}

export interface ExerciseGradeResult {
  exercise_id: string;
  score: number;
  is_correct: boolean;
  feedback: string;
  misconceptions: string[];
}

export interface MasteryUpdate {
  old: number;
  new: number;
  delta: number;
  level: 'novice' | 'beginner' | 'competent' | 'proficient' | 'expert';
}

export interface SubmitExamResult {
  exam_attempt_id: string;
  score: number;
  correct_count: number;
  results: ExerciseGradeResult[];
  mastery_update: MasteryUpdate;
}

// Mastery & Attempt types
export interface SubmitAttemptRequest {
  exercise_id: string;
  answer: string | string[];
  code?: string;
  language?: string;
}

export interface AttemptResponse {
  attempt_id: string;
  grade: {
    score: number;
    is_correct: boolean;
    feedback: string;
    misconceptions?: string[] | null;
  };
  mastery: {
    score: number;
    level: string;
    total_attempts: number;
  };
}

export interface NodeMasteryResponse {
  mastery: {
    score: number;
    level: string;
    total_attempts: number;
    last_updated?: string | null;
  };
}

export interface PlanMasteryOverviewResponse {
  mastery_by_node: Record<string, {
    score: number;
    level: string;
    total_attempts: number;
    last_updated?: string | null;
    has_exam_attempt?: boolean;
  }>;
}

export interface NextNodeRecommendationResponse {
  recommended_node_id: string | null;
  rationale: string;
  current_progress: {
    nodes_completed: number;
    total_nodes: number;
    completion_percentage: number;
  };
  all_prerequisites_met: boolean;
}

// YouTube Resource types
export interface ResourceAttachmentResponse {
  plan_id: string;
  resources: NodeResources[];
}

export interface NodeResources {
  node_id: string;
  resources: YouTubeResource[];
}

export interface YouTubeResource {
  video_id: string;
  title: string;
  channel: string;
  duration_seconds: number;
  thumbnail_url: string;
  relevance_score: number;
  url: string;
  type: 'must_watch' | 'recommended';
  rationale: string;
}

// Reading Material types
export interface ReadingMaterialSection {
  heading: string;
  content: string;
}

// Resource status types
export type NodeResourceStatus = 'ready' | 'pending';
export type NodeResourceStatusMap = Record<string, NodeResourceStatus>;

export interface NodeLearnContent {
  resources: YouTubeResource[];
  reading_material: {
    sections: ReadingMaterialSection[];
  } | null;
  cached: boolean;
  reading_material_error?: string;
}

// Error types
export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
  request_id: string;
}

// Query params for user plans
export interface GetUserPlansRequest {
  limit?: number;
  offset?: number;
}

export interface UserPlansResponse {
  plans: UserPlanSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserPlanSummary {
  plan_id: string;
  topic: string;
  user_level: string;
  plan_size: string;
  started_at: string;
  last_accessed_at: string;
}
