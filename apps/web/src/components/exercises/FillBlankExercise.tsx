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

/**
 * Split prompt on `___` placeholders to create inline blanks.
 * Returns text segments interleaved with blank indices.
 */
function parsePromptBlanks(prompt: string): { segments: string[]; blankCount: number } {
  const segments = prompt.split('___');
  return { segments, blankCount: segments.length - 1 };
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
  const { segments, blankCount } = parsePromptBlanks(exercise.prompt);
  const expectedCount = exercise.correct_answer
    ? Math.max(blankCount, exercise.correct_answer.answers.length)
    : blankCount;
  const answers = (answer as string[]) || Array.from({ length: expectedCount }, () => '');

  const handleBlankChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    onAnswerChange(newAnswers);
  };

  const isComplete = answers.length > 0 && answers.every((a) => a.trim() !== '');

  return (
    <div className="space-y-4">
      {/* Prompt with inline blanks */}
      <div className="text-warm-50 font-medium leading-relaxed flex flex-wrap items-center gap-1">
        {segments.map((segment, index) => (
          <span key={index} className="contents">
            {segment && <span>{segment}</span>}
            {index < blankCount && (
              <input
                type="text"
                value={answers[index] || ''}
                onChange={(e) => handleBlankChange(index, e.target.value)}
                disabled={disabled}
                placeholder={`Blank ${index + 1}`}
                className={cn(
                  'inline-flex min-w-[120px] max-w-[200px] px-3 py-1.5 rounded-lg border-2 border-dashed',
                  'bg-hearth-700/50 text-warm-50 placeholder:text-warm-600',
                  'focus:border-amber focus:outline-none focus:ring-2 focus:ring-amber/20',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  'transition-colors'
                )}
              />
            )}
          </span>
        ))}
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: expectedCount }, (_, index) => (
            <div
              key={index}
              className={cn(
                'w-2 h-2 rounded-full transition-colors',
                answers[index]?.trim()
                  ? 'bg-amber'
                  : 'bg-hearth-700'
              )}
            />
          ))}
        </div>
        <span className="text-xs text-warm-400">
          {answers.filter((a) => a.trim()).length}/{expectedCount} blanks filled
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
