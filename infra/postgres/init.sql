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
  FOREIGN KEY (plan_id, node_id) REFERENCES nodes(plan_id, node_id) ON DELETE CASCADE
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
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
