import { useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FlashcardExercise as FlashcardExerciseType } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface FlashcardExerciseProps {
  exercise: FlashcardExerciseType;
  answer: unknown;
  onAnswerChange: (answer: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  disabled: boolean;
  examMode?: boolean;
}

export function FlashcardExercise({
  exercise,
  answer,
  onAnswerChange,
  onSubmit,
  isSubmitting,
  disabled,
  examMode,
}: FlashcardExerciseProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const selfAssessment = answer as string | undefined;

  const handleFlip = () => {
    if (!disabled) {
      setIsFlipped(!isFlipped);
    }
  };

  const handleSelfAssess = (assessment: 'correct' | 'partial' | 'incorrect') => {
    onAnswerChange(assessment);
    if (!examMode) {
      onSubmit();
    }
  };

  return (
    <div className="space-y-4">
      {/* Flashcard */}
      <div
        className="relative h-64 cursor-pointer perspective-1000"
        onClick={handleFlip}
      >
        <motion.div
          className="relative w-full h-full"
          initial={false}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: 'spring', stiffness: 200, damping: 25 }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Front (Question) */}
          <div
            className={cn(
              'absolute inset-0 p-6 rounded-2xl border-2 border-amber/30 bg-gradient-to-br from-hearth-800 to-hearth-700',
              'flex flex-col items-center justify-center text-center',
              'backface-hidden'
            )}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="text-xs text-amber/70 uppercase tracking-wide mb-4">Question</span>
            <p className="text-lg font-medium text-warm-50">{exercise.prompt}</p>
            <span className="absolute bottom-4 text-xs text-warm-600">
              Click to reveal answer
            </span>
          </div>

          {/* Back (Answer) */}
          <div
            className={cn(
              'absolute inset-0 p-6 rounded-2xl border-2 border-sage/30 bg-gradient-to-br from-sage/5 to-sage/10',
              'flex flex-col items-center justify-center text-center',
              'backface-hidden'
            )}
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="text-xs text-sage uppercase tracking-wide mb-4">Answer</span>
            <p className="text-lg font-medium text-warm-50">{exercise.correct_answer}</p>
            <span className="absolute bottom-4 text-xs text-warm-600">
              Click to flip back
            </span>
          </div>
        </motion.div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          onClick={handleFlip}
          variant="outline"
          size="sm"
          disabled={disabled}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Flip Card
        </Button>
      </div>

      {/* Self-assessment (after flipping) */}
      {isFlipped && !examMode && (
        <div className="space-y-3">
          <p className="text-sm text-center text-warm-400">How well did you know this?</p>
          <div className="flex justify-center gap-2">
            <Button
              onClick={() => handleSelfAssess('incorrect')}
              variant="outline"
              size="sm"
              disabled={disabled || isSubmitting}
              className={cn(
                selfAssessment === 'incorrect' && 'border-rose bg-rose/10'
              )}
            >
              Didn't Know
            </Button>
            <Button
              onClick={() => handleSelfAssess('partial')}
              variant="outline"
              size="sm"
              disabled={disabled || isSubmitting}
              className={cn(
                selfAssessment === 'partial' && 'border-amber bg-amber/10'
              )}
            >
              Partially
            </Button>
            <Button
              onClick={() => handleSelfAssess('correct')}
              variant="outline"
              size="sm"
              disabled={disabled || isSubmitting}
              className={cn(
                selfAssessment === 'correct' && 'border-sage bg-sage/10'
              )}
            >
              Knew It!
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
