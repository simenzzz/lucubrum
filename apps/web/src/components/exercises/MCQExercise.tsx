import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MCQExercise as MCQExerciseType } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface MCQExerciseProps {
  exercise: MCQExerciseType;
  answer: unknown;
  onAnswerChange: (answer: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  disabled: boolean;
  examMode?: boolean;
}

export function MCQExercise({
  exercise,
  answer,
  onAnswerChange,
  onSubmit,
  isSubmitting,
  disabled,
  examMode,
}: MCQExerciseProps) {
  const selectedAnswer = answer as string | undefined;

  return (
    <div className="space-y-4">
      {/* Question */}
      <p className="text-ink font-medium">{exercise.question}</p>

      {/* Options */}
      <div className="space-y-2">
        {exercise.options.map((option, index) => {
          const isSelected = selectedAnswer === option;
          const optionLabel = String.fromCharCode(65 + index); // A, B, C, D

          return (
            <button
              key={index}
              onClick={() => !disabled && onAnswerChange(option)}
              disabled={disabled}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all',
                isSelected
                  ? 'border-gold bg-gold/10'
                  : 'border-parchment-dark hover:border-gold/50 hover:bg-parchment-dark/50',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <span
                className={cn(
                  'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm',
                  isSelected
                    ? 'bg-gold text-ink'
                    : 'bg-parchment-dark text-ink/60'
                )}
              >
                {isSelected ? <CheckCircle2 className="w-4 h-4" /> : optionLabel}
              </span>
              <span className="text-ink/80">{option}</span>
            </button>
          );
        })}
      </div>

      {/* Submit button */}
      {!examMode && (
        <Button
          onClick={onSubmit}
          disabled={!selectedAnswer || isSubmitting || disabled}
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
