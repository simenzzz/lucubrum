import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FillBlankExercise as FillBlankExerciseType } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface FillBlankExerciseProps {
  exercise: FillBlankExerciseType;
  answer: unknown;
  onAnswerChange: (answer: string[]) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  disabled: boolean;
  examMode?: boolean;
}

export function FillBlankExercise({
  exercise,
  answer,
  onAnswerChange,
  onSubmit,
  isSubmitting,
  disabled,
  examMode,
}: FillBlankExerciseProps) {
  const answers = (answer as string[]) || exercise.blanks.map(() => '');

  const handleBlankChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    onAnswerChange(newAnswers);
  };

  const isComplete = answers.every((a) => a.trim() !== '');

  return (
    <div className="space-y-4">
      {/* Question */}
      <p className="text-ink font-medium">{exercise.question}</p>

      {/* Fill in the blanks */}
      <div className="space-y-3">
        {exercise.blanks.map((blank, index) => (
          <div key={index} className="flex items-center gap-2 flex-wrap">
            {blank.before && (
              <span className="text-ink/80">{blank.before}</span>
            )}
            <input
              type="text"
              value={answers[index] || ''}
              onChange={(e) => handleBlankChange(index, e.target.value)}
              disabled={disabled}
              placeholder={`Blank ${index + 1}`}
              className={cn(
                'inline-flex min-w-[120px] max-w-[200px] px-3 py-1.5 rounded-md border-2 border-dashed',
                'bg-parchment-dark/30 text-ink placeholder:text-ink/40',
                'focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'transition-colors'
              )}
            />
            {blank.after && (
              <span className="text-ink/80">{blank.after}</span>
            )}
          </div>
        ))}
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {exercise.blanks.map((_, index) => (
            <div
              key={index}
              className={cn(
                'w-2 h-2 rounded-full transition-colors',
                answers[index]?.trim()
                  ? 'bg-gold'
                  : 'bg-parchment-dark'
              )}
            />
          ))}
        </div>
        <span className="text-xs text-ink/50">
          {answers.filter((a) => a.trim()).length}/{exercise.blanks.length} blanks filled
        </span>
      </div>

      {/* Submit button */}
      {!examMode && (
        <Button
          onClick={onSubmit}
          disabled={!isComplete || isSubmitting || disabled}
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
