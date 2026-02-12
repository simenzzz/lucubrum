import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShortAnswerExercise as ShortAnswerExerciseType } from '@/types/api.types';

interface ShortAnswerExerciseProps {
  exercise: ShortAnswerExerciseType;
  answer: unknown;
  onAnswerChange: (answer: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  disabled: boolean;
  examMode?: boolean;
}

export function ShortAnswerExercise({
  exercise,
  answer,
  onAnswerChange,
  onSubmit,
  isSubmitting,
  disabled,
  examMode,
}: ShortAnswerExerciseProps) {
  const textAnswer = (answer as string) || '';
  const maxLength = 500;

  return (
    <div className="space-y-4">
      {/* Question */}
      <p className="text-warm-50 font-medium">{exercise.prompt}</p>

      {/* Answer textarea */}
      <div className="space-y-2">
        <textarea
          value={textAnswer}
          onChange={(e) => onAnswerChange(e.target.value)}
          disabled={disabled}
          placeholder="Type your answer here..."
          className="w-full min-h-[120px] p-3 rounded-xl border-2 border-border-moderate bg-hearth-700 text-warm-50 placeholder:text-warm-400 focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/20 resize-y transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          maxLength={maxLength}
        />
        <div className="flex justify-end">
          <span className="text-xs text-warm-400">
            {textAnswer.length}/{maxLength}
          </span>
        </div>
      </div>

      {/* Submit button */}
      {!examMode && (
        <Button
          onClick={onSubmit}
          disabled={!textAnswer.trim() || isSubmitting || disabled}
          variant="primary"
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Checking...
            </>
          ) : (
            'Submit Answer'
          )}
        </Button>
      )}
    </div>
  );
}
