// Extended types for UI-specific plan representations

import type { PlanNode, ScheduleItem, YouTubeResource, NodeMasteryResponse } from './api.types';

// Mastery status for UI rendering
export type MasteryStatus = 'locked' | 'available' | 'in_progress' | 'mastered';

// Node with computed UI state
export interface UiNode extends PlanNode {
  status: MasteryStatus;
  mastery: number;
  position: NodePosition;
  resources?: YouTubeResource[];
}

// 3D position for node in the scene
export interface NodePosition {
  x: number;
  y: number;
  z: number;
}

// Plan with all computed UI state
export interface UiPlan {
  planId: string;
  topic: string;
  userLevel: string;
  nodes: Map<string, UiNode>;
  schedule: ScheduleItem[];
  overallMastery: number;
  completedNodes: number;
  totalNodes: number;
}

// Selected node state for popup
export interface SelectedNodeState {
  nodeId: string;
  node: UiNode;
  mastery: NodeMasteryResponse | null;
}

// Camera state for 3D scene
export interface CameraState {
  targetNodeId: string | null;
  isAnimating: boolean;
  zoom: number;
}

// Filter state for roadmap
export interface RoadmapFilters {
  showLocked: boolean;
  showCompleted: boolean;
  masteryThreshold: number; // 0-100
}

// Exercise tab state in node popup
export type ExerciseTab = 'learning' | 'practice' | 'exam';

// Form types for plan creation
export interface PlanFormData {
  topic: string;
  userLevel: 'beginner' | 'intermediate' | 'advanced';
  sizePreference: 'concise' | 'standard' | 'comprehensive';
}

// Level badge configuration
export interface LevelBadge {
  value: 'beginner' | 'intermediate' | 'advanced';
  label: string;
  icon: string;
  color: string;
  description: string;
}

// Progress chart data point
export interface MasteryDataPoint {
  date: string;
  mastery: number;
  nodesCompleted: number;
}

// Exercise statistics
export interface ExerciseStats {
  total: number;
  correct: number;
  incorrect: number;
  averageScore: number;
  byType: {
    mcq: { total: number; correct: number };
    short_answer: { total: number; correct: number };
    fill_blank: { total: number; correct: number };
    coding: { total: number; correct: number };
    flashcard: { total: number; correct: number };
  };
}

// Achievement badge
export interface AchievementBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  target?: number;
}
