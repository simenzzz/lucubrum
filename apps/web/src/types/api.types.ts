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
  size_preference?: 'concise' | 'standard' | 'comprehensive';
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
  description: string;
  objectives: string[];
  estimated_minutes: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  prerequisites: string[];
}

export interface ScheduleItem {
  node_id: string;
  order: number;
  suggested_days: number;
}

export interface ArtifactMetadata {
  request_id: string;
  prompt_version: string;
  provider: string;
  model: string;
  created_at: string;
}

// Exercise types
export interface GenerateExercisesRequest {
  difficulty?: 1 | 2 | 3 | 4 | 5;
  force?: boolean;
}

export interface ExerciseSetResponse {
  exercise_set_id: string;
  node_id: string;
  exercises: Exercise[];
  metadata: ArtifactMetadata;
}

export type Exercise = MCQExercise | ShortAnswerExercise | FillBlankExercise | CodingExercise | FlashcardExercise;

export interface BaseExercise {
  id: string;
  type: 'mcq' | 'short_answer' | 'fill_blank' | 'coding' | 'flashcard';
  question: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  explanation?: string;
}

export interface MCQExercise extends BaseExercise {
  type: 'mcq';
  options: string[];
  correct_answer: string;
}

export interface ShortAnswerExercise extends BaseExercise {
  type: 'short_answer';
  correct_answer: string;
  keywords: string[];
}

export interface FillBlankExercise extends BaseExercise {
  type: 'fill_blank';
  blanks: {
    before: string;
    after?: string;
    answer: string;
  }[];
}

export interface CodingExercise extends BaseExercise {
  type: 'coding';
  starter_code: string;
  language: string;
  test_cases: Array<{
    input: string;
    expected_output: string;
  }>;
  correct_answer: string;
}

export interface FlashcardExercise extends BaseExercise {
  type: 'flashcard';
  answer: string;
  hints?: string[];
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
  metadata: ArtifactMetadata;
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
  published_at: string;
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
