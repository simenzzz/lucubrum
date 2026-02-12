import { useState } from 'react';
import { Play, RefreshCw, Loader2 } from 'lucide-react';
import { useGenerateExercises, useExercises } from '@/hooks/usePlan';
import { Button } from '@/components/ui/button';
import { ExerciseCard } from '@/components/exercises/ExerciseCard';
import type { PlanNode } from '@/types/api.types';

interface PracticeTabProps {
  node: PlanNode;
  planId: string;
  mastery: number;
}

export function PracticeTab({ node, planId, mastery }: PracticeTabProps) {
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(
    Math.max(1, Math.min(5, Math.ceil(mastery * 5) || 1)) as 1 | 2 | 3 | 4 | 5
  );
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [completedExercises, setCompletedExercises] = useState<Set<string>>(new Set());

  // Fetch existing exercises
  const {
    data: exerciseSet,
    isLoading: exercisesLoading,
  } = useExercises(planId, node.node_id);

  // Generate exercises mutation
  const generateMutation = useGenerateExercises();

  const exercises = exerciseSet?.exercises || [];
  const currentExercise = exercises[currentExerciseIndex];

  const handleGenerate = () => {
    generateMutation.mutate({
      planId,
      nodeId: node.node_id,
      params: { difficulty_target: difficulty, force: true },
    });
    setCurrentExerciseIndex(0);
    setCompletedExercises(new Set());
  };

  const handleExerciseComplete = (exerciseId: string) => {
    setCompletedExercises((prev) => new Set(prev).add(exerciseId));
    // Auto-advance to next exercise after a short delay
    setTimeout(() => {
      if (currentExerciseIndex < exercises.length - 1) {
        setCurrentExerciseIndex((i) => i + 1);
      }
    }, 1500);
  };

  const isLoading = exercisesLoading || generateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-sm text-warm-200">Difficulty:</label>
          <div className="flex gap-1">
            {([1, 2, 3, 4, 5] as const).map((level) => (
              <button
                key={level}
                onClick={() => setDifficulty(level)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  difficulty === level
                    ? 'bg-amber text-hearth-900'
                    : 'bg-hearth-700 text-warm-400 hover:bg-hearth-600'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isLoading}
          variant="primary"
          size="sm"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : exercises.length > 0 ? (
            <RefreshCw className="w-4 h-4 mr-2" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          {exercises.length > 0 ? 'Generate New' : 'Generate Exercises'}
        </Button>
      </div>

      {/* Exercise navigation */}
      {exercises.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {exercises.map((ex, index) => (
            <button
              key={ex.id}
              onClick={() => setCurrentExerciseIndex(index)}
              className={`w-8 h-8 rounded-full text-xs font-medium transition-all ${
                index === currentExerciseIndex
                  ? 'bg-amber text-hearth-900 ring-2 ring-amber/50'
                  : completedExercises.has(ex.id)
                    ? 'bg-sage/20 text-sage border border-sage/30'
                    : 'bg-hearth-700 text-warm-400 hover:bg-hearth-600'
              }`}
            >
              {index + 1}
            </button>
          ))}
          <span className="text-xs text-warm-400 ml-2">
            {completedExercises.size}/{exercises.length} completed
          </span>
        </div>
      )}

      {/* Exercise display */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-amber mx-auto mb-3" />
            <p className="text-sm text-warm-400">
              {generateMutation.isPending ? 'Generating exercises...' : 'Loading exercises...'}
            </p>
          </div>
        </div>
      ) : exercises.length === 0 ? (
        <div className="text-center py-12 bg-hearth-700/30 rounded-xl border border-border-moderate">
          <Play className="w-10 h-10 text-warm-400 mx-auto mb-3" />
          <p className="text-warm-200 mb-2">No exercises generated yet</p>
          <p className="text-sm text-warm-400">
            Click "Generate Exercises" to create practice questions for this topic.
          </p>
        </div>
      ) : currentExercise ? (
        <ExerciseCard
          exercise={currentExercise}
          planId={planId}
          nodeId={node.node_id}
          onComplete={() => handleExerciseComplete(currentExercise.id)}
          isCompleted={completedExercises.has(currentExercise.id)}
        />
      ) : null}

      {/* Session summary */}
      {exercises.length > 0 && completedExercises.size === exercises.length && (
        <div className="p-4 rounded-xl bg-sage/10 border border-sage/30">
          <h4 className="font-heading font-semibold text-sage mb-2">Practice Complete!</h4>
          <p className="text-sm text-warm-200">
            You've completed all {exercises.length} exercises. Generate new ones to continue practicing.
          </p>
        </div>
      )}
    </div>
  );
}
