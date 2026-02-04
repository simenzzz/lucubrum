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
      <p className="text-ink font-medium">{exercise.question}</p>

      {/* Answer textarea */}
      <div className="space-y-2">
        <textarea
          value={textAnswer}
          onChange={(e) => onAnswerChange(e.target.value)}
          disabled={disabled}
          placeholder="Type your answer here..."
          className="w-full min-h-[120px] p-3 rounded-lg border-2 border-parchment-dark bg-parchment focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 resize-y transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          maxLength={maxLength}
        />
        <div className="flex justify-end">
          <span className="text-xs text-ink/50">
            {textAnswer.length}/{maxLength}
          </span>
        </div>
      </div>

      {/* Keywords hint (optional) */}
      {exercise.keywords.length > 0 && !examMode && (
        <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
          <p className="text-xs text-ink/60">
            <span className="font-medium">Hint:</span> Your answer should mention concepts like:{' '}
            {exercise.keywords.slice(0, 3).join(', ')}
            {exercise.keywords.length > 3 && '...'}
          </p>
        </div>
      )}

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
