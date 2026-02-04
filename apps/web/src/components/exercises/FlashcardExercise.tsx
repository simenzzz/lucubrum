import { useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Lightbulb } from 'lucide-react';
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
  const [showHint, setShowHint] = useState(false);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);
  const selfAssessment = answer as string | undefined;

  const handleFlip = () => {
    if (!disabled) {
      setIsFlipped(!isFlipped);
    }
  };

  const handleShowNextHint = () => {
    if (exercise.hints && currentHintIndex < exercise.hints.length - 1) {
      setCurrentHintIndex((i) => i + 1);
    }
    setShowHint(true);
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
          transition={{ duration: 0.6, type: 'spring', stiffness: 100 }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Front (Question) */}
          <div
            className={cn(
              'absolute inset-0 p-6 rounded-xl border-2 border-gold/30 bg-gradient-to-br from-parchment to-parchment-dark',
              'flex flex-col items-center justify-center text-center',
              'backface-hidden'
            )}
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="text-xs text-gold-muted uppercase tracking-wide mb-4">Question</span>
            <p className="text-lg font-medium text-ink">{exercise.question}</p>
            <span className="absolute bottom-4 text-xs text-ink/40">
              Click to reveal answer
            </span>
          </div>

          {/* Back (Answer) */}
          <div
            className={cn(
              'absolute inset-0 p-6 rounded-xl border-2 border-forest/30 bg-gradient-to-br from-forest/5 to-forest/10',
              'flex flex-col items-center justify-center text-center',
              'backface-hidden'
            )}
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="text-xs text-forest uppercase tracking-wide mb-4">Answer</span>
            <p className="text-lg font-medium text-ink">{exercise.answer}</p>
            <span className="absolute bottom-4 text-xs text-ink/40">
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

        {exercise.hints && exercise.hints.length > 0 && !isFlipped && (
          <Button
            onClick={(e) => {
              e.stopPropagation();
              handleShowNextHint();
            }}
            variant="ghost"
            size="sm"
            disabled={disabled}
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            {showHint ? `Hint ${currentHintIndex + 1}/${exercise.hints.length}` : 'Show Hint'}
          </Button>
        )}
      </div>

      {/* Hint display */}
      {showHint && exercise.hints && !isFlipped && (
        <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
          <p className="text-sm text-ink/70">
            <span className="font-medium text-gold">Hint:</span>{' '}
            {exercise.hints[currentHintIndex]}
          </p>
        </div>
      )}

      {/* Self-assessment (after flipping) */}
      {isFlipped && !examMode && (
        <div className="space-y-3">
          <p className="text-sm text-center text-ink/60">How well did you know this?</p>
          <div className="flex justify-center gap-2">
            <Button
              onClick={() => handleSelfAssess('incorrect')}
              variant="outline"
              size="sm"
              disabled={disabled || isSubmitting}
              className={cn(
                selfAssessment === 'incorrect' && 'border-terracotta bg-terracotta/10'
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
                selfAssessment === 'partial' && 'border-gold bg-gold/10'
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
                selfAssessment === 'correct' && 'border-forest bg-forest/10'
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
