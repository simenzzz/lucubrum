// API request/response types matching the backend contracts

// Auth types
export interface GoogleAuthRequest {
  redirect_uri?: string;
}

export interface GoogleAuthResponse {
  authorization_url: string;
  state: string;
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
  type: 'mcq' | 'short_answer' | 'fill_blank' | 'coding' | 'flashcard';
  prompt: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  rubric?: string;
}

export interface MCQExercise extends BaseExercise {
  type: 'mcq';
  choices: string[];
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

// Mastery & Attempt types
export interface SubmitAttemptRequest {
  exercise_id: string;
  answer: string | string[];
  code?: string;
  language?: string;
}

export interface AttemptResponse {
  attempt_id: string;
  exercise_id: string;
  is_correct: boolean;
  score: number;
  feedback: string;
  misconceptions?: string[];
  mastery_before: number;
  mastery_after: number;
}

export interface NodeMasteryResponse {
  node_id: string;
  mastery: number;
  attempt_count: number;
  last_attempt_at?: string;
  next_review_at?: string;
}

export interface PlanMasteryOverviewResponse {
  plan_id: string;
  node_masteries: {
    node_id: string;
    mastery: number;
    status: 'locked' | 'available' | 'in_progress' | 'mastered';
  }[];
  overall_mastery: number;
  completed_nodes: number;
  total_nodes: number;
}

export interface NextNodeRecommendationResponse {
  node_id: string;
  title: string;
  rationale: string;
  current_mastery: number;
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
  url?: string;
  type?: 'must_watch' | 'recommended';
  rationale?: string;
}

// Error types
export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
  timestamp: string;
}

// Query params for user plans
export interface GetUserPlansRequest {
  limit?: number;
  offset?: number;
}

export interface UserPlansResponse {
  plans: UserPlanSummary[];
  total: number;
}

export interface UserPlanSummary {
  plan_id: string;
  topic: string;
  user_level: string;
  mastery: number;
  node_count: number;
  completed_nodes: number;
  last_accessed_at: string;
  created_at: string;
}
