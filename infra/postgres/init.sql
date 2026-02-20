-- Learning Helper Database Schema
-- This script is run automatically when the Postgres container is first created

-- Plans
CREATE TABLE plans (
  plan_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  topic VARCHAR(500) NOT NULL,
  user_level VARCHAR(50) NOT NULL,
  plan_size VARCHAR(20) NOT NULL DEFAULT 'moderate',
  metadata JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_plans_user ON plans(user_id);
CREATE INDEX idx_plans_created ON plans(created_at);

-- Nodes (composite primary key: plan_id + node_id)
CREATE TABLE nodes (
  plan_id UUID NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  node_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  objectives JSONB NOT NULL,
  prerequisites JSONB NOT NULL,
  estimated_minutes INT NOT NULL,
  tags JSONB,
  order_index INT NOT NULL,
  PRIMARY KEY (plan_id, node_id)
);
CREATE INDEX idx_nodes_plan ON nodes(plan_id);

-- Resources (YouTube videos) - references composite key
CREATE TABLE resources (
  resource_id UUID PRIMARY KEY,
  plan_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  video_id VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  channel_title VARCHAR(255),
  url VARCHAR(500) NOT NULL,
  duration_seconds INT,
  rank_score FLOAT NOT NULL,
  type VARCHAR(50) NOT NULL,
  rationale VARCHAR(240),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE,
  UNIQUE(plan_id, node_id, video_id) -- Prevent duplicate videos per node
);
CREATE INDEX idx_resources_node ON resources(plan_id, node_id);
CREATE INDEX idx_resources_plan_node_score ON resources(plan_id, node_id, rank_score DESC);

-- Exercises - references composite key
CREATE TABLE exercises (
  exercise_id UUID PRIMARY KEY,
  plan_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  prompt TEXT NOT NULL,
  choices JSONB,
  correct_answer JSONB NOT NULL,
  rubric TEXT NOT NULL,
  difficulty INT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE
);
CREATE INDEX idx_exercises_node ON exercises(plan_id, node_id);
CREATE INDEX idx_exercises_difficulty ON exercises(difficulty);

-- Attempts (user answers)
CREATE TABLE attempts (
  attempt_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  exercise_id UUID NOT NULL REFERENCES exercises(exercise_id) ON DELETE CASCADE,
  user_answer JSONB NOT NULL,
  score FLOAT NOT NULL CHECK (score BETWEEN 0 AND 1),
  is_correct BOOLEAN NOT NULL,
  feedback TEXT NOT NULL,
  misconceptions JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_attempts_user_exercise ON attempts(user_id, exercise_id);
CREATE INDEX idx_attempts_created ON attempts(created_at);

-- User Mastery - references composite key
CREATE TABLE user_mastery (
  user_id VARCHAR(255) NOT NULL,
  plan_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  mastery_score FLOAT NOT NULL CHECK (mastery_score BETWEEN 0 AND 1),
  last_updated TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_id, node_id),
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE
);
CREATE INDEX idx_mastery_user ON user_mastery(user_id);

-- Refresh Tokens (for OAuth)
CREATE TABLE refresh_tokens (
  token_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- LLM Call Logs
CREATE TABLE llm_calls (
  call_id UUID PRIMARY KEY,
  operation VARCHAR(100) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_hash VARCHAR(64),
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_version VARCHAR(50) NOT NULL,
  duration_ms INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  validation_errors JSONB,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_llm_calls_operation ON llm_calls(operation);
CREATE INDEX idx_llm_calls_provider ON llm_calls(provider);
CREATE INDEX idx_llm_calls_created ON llm_calls(created_at);

-- Users table (for OAuth)
CREATE TABLE users (
  user_id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  picture_url VARCHAR(500),
  roles JSONB NOT NULL DEFAULT '["user"]',
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);

-- User-Plan Junction (many-to-many: tracks which users engage with which plans)
-- Plans are shared content; this enables "my plans" without ownership restrictions
CREATE TABLE user_plans (
  user_id VARCHAR(255) NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(plan_id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_id)
);
CREATE INDEX idx_user_plans_user ON user_plans(user_id);
CREATE INDEX idx_user_plans_plan ON user_plans(plan_id);

-- Reading Materials (LLM-generated from video descriptions)
CREATE TABLE reading_materials (
  plan_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  sections JSONB NOT NULL,       -- Array of { heading: string, content: string }
  metadata JSONB NOT NULL,       -- ArtifactMetadata (provider, model, prompt_version, etc.)
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (plan_id, node_id),
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE
);
CREATE INDEX idx_reading_materials_plan ON reading_materials(plan_id);

-- Staleness Policies (configurable cache invalidation rules by domain)
CREATE TABLE staleness_policies (
  id SERIAL PRIMARY KEY,
  domain_category VARCHAR(100) UNIQUE NOT NULL,
  policy_value VARCHAR(20) NOT NULL,  -- Values: 'never', '7d', '30d', '90d', 'annual'
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_staleness_domain ON staleness_policies(domain_category);

-- Seed initial staleness policies
INSERT INTO staleness_policies (domain_category, policy_value, description) VALUES
  ('math', 'never', 'Core mathematics does not change'),
  ('cs', 'annual', 'Computer science theory is stable'),
  ('networking', '90d', 'Networking protocols evolve slowly'),
  ('cloud', '30d', 'Cloud infrastructure changes frequently'),
  ('web', '14d', 'Web frameworks evolve rapidly'),
  ('ai', '7d', 'AI/ML is extremely volatile'),
  ('general', '30d', 'Default for unspecified domains')
ON CONFLICT (domain_category) DO NOTHING;

-- Quality Metrics (tracks plan quality signals for cache invalidation)
CREATE TABLE quality_metrics (
  plan_id UUID NOT NULL,
  normalized_topic VARCHAR(255) NOT NULL,
  sample_size INT NOT NULL,
  completion_rate FLOAT,
  exercise_pass_rate FLOAT,
  avg_time_ratio FLOAT,
  negative_feedback_rate FLOAT,
  measured_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (plan_id, measured_at)
);
CREATE INDEX idx_quality_measured ON quality_metrics(measured_at);
CREATE INDEX idx_quality_plan ON quality_metrics(plan_id);

-- Exam Sessions (track in-progress exams)
CREATE TABLE exam_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  plan_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  exercises JSONB NOT NULL,
  exam_difficulty DECIMAL(3,2) NOT NULL,
  time_limit_seconds INTEGER NOT NULL DEFAULT 1800,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE
);
CREATE INDEX idx_exam_sessions_user ON exam_sessions(user_id, plan_id, node_id);

-- Exam Attempts (completed exams with results)
CREATE TABLE exam_attempts (
  exam_attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES exam_sessions(session_id),
  user_id VARCHAR(255) NOT NULL,
  plan_id UUID NOT NULL,
  node_id VARCHAR(255) NOT NULL,
  mastery_level_old DECIMAL(3,2) NOT NULL CHECK (mastery_level_old BETWEEN 0.0 AND 1.0),
  mastery_level_new DECIMAL(3,2) NOT NULL CHECK (mastery_level_new BETWEEN 0.0 AND 1.0),
  exam_difficulty DECIMAL(3,2) NOT NULL,
  score DECIMAL(3,2) NOT NULL,
  exercises_count INTEGER NOT NULL DEFAULT 10,
  correct_count INTEGER NOT NULL,
  answers JSONB NOT NULL,
  grades JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  time_limit_seconds INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE
);
CREATE INDEX idx_exam_attempts_user ON exam_attempts(user_id);
CREATE INDEX idx_exam_attempts_plan_node ON exam_attempts(plan_id, node_id);

-- Trusted Instructors (channel reliability scores for ranking)
CREATE TABLE trusted_instructors (
  channel_id VARCHAR(255) PRIMARY KEY,
  channel_name VARCHAR(255) NOT NULL,
  reliability_score FLOAT NOT NULL CHECK (reliability_score BETWEEN 0 AND 1),
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_trusted_channel_name ON trusted_instructors(LOWER(channel_name));

-- Seed with well-known educational channels
INSERT INTO trusted_instructors (channel_id, channel_name, reliability_score, source, notes) VALUES
  ('UCYO_jab_esuFRV4b17AJtAw', '3Blue1Brown', 0.95, 'manual', 'Exceptional math visualization'),
  ('UCEBb1b_L6zDS3xTUrIALZOw', 'MIT OpenCourseWare', 0.95, 'manual', 'University-level lectures'),
  ('UC4a-Gbdw7vOaccHmFo40b9g', 'Khan Academy', 0.90, 'manual', 'Comprehensive educational content'),
  ('UC8butISFwT-Wl7EV0hUK0BQ', 'freeCodeCamp.org', 0.90, 'manual', 'Quality coding tutorials'),
  ('UC9-y-6csu5WGm29I7JiwpnA', 'Computerphile', 0.85, 'manual', 'CS concepts explained well'),
  ('UCvjgXvBlbQiydffZU7m1_aw', 'The Coding Train', 0.85, 'manual', 'Creative coding education'),
  ('UCsBjURrPoezykLs9EqgamOA', 'Fireship', 0.80, 'manual', 'Tech quick guides'),
  ('UCxX9wt5FWQUAAz4UrysqK9A', 'CS Dojo', 0.80, 'manual', 'Clear explanations')
ON CONFLICT (channel_id) DO NOTHING;
