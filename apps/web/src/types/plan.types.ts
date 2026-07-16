// Extended types for UI-specific plan representations

// Form types for plan creation
export interface PlanFormData {
  topic: string;
  userLevel: 'beginner' | 'intermediate' | 'advanced';
  sizePreference: 'basic' | 'moderate' | 'large';
}
