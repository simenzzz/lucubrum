import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MCQExercise } from './MCQExercise';
import { ShortAnswerExercise } from './ShortAnswerExercise';
import { FillBlankExercise } from './FillBlankExercise';
import { CodingExercise } from './CodingExercise';
import { FlashcardExercise } from './FlashcardExercise';
import { GradeResult } from './GradeResult';
import { useSubmitAttempt } from '@/hooks/useMastery';
import type { Exercise, ExamExercise, AttemptResponse } from '@/types/api.types';

interface ExerciseCardProps {
  exercise: Exercise | ExamExercise;
  planId: string;
  nodeId: string;
  onComplete?: () => void;
  isCompleted?: boolean;
  examMode?: boolean;
  savedAnswer?: unknown;
  onAnswerChange?: (answer: unknown) => void;
  currentMastery?: number;
}

const EXERCISE_TYPE_LABELS: Record<string, string> = {
  mcq: 'Multiple Choice',
  short_answer: 'Short Answer',
  fill_blank: 'Fill in the Blank',
  coding: 'Coding',
  flashcard: 'Flashcard',
};

const EXERCISE_TYPE_TO_BADGE: Record<string, string> = {
  mcq: 'mcq',
  short_answer: 'shortAnswer',
  fill_blank: 'fillBlank',
  coding: 'coding',
  flashcard: 'flashcard',
};

const DIFFICULTY_VARIANT: Record<number, 'easy' | 'medium' | 'hard'> = {
  1: 'easy',
  2: 'easy',
  3: 'medium',
  4: 'hard',
  5: 'hard',
};

export function ExerciseCard({
  exercise,
  planId,
  nodeId,
  onComplete,
  isCompleted = false,
  examMode = false,
  savedAnswer,
  onAnswerChange,
  currentMastery,
}: ExerciseCardProps) {
  const [userAnswer, setUserAnswer] = useState<unknown>(savedAnswer);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [showResult, setShowResult] = useState(false);

  const submitMutation = useSubmitAttempt();

  // Sync savedAnswer for exam mode (reset to empty for unanswered questions)
  useEffect(() => {
    if (examMode) {
      setUserAnswer(savedAnswer ?? '');
    }
  }, [savedAnswer, examMode]);

  const handleAnswerChange = (answer: unknown) => {
    setUserAnswer(answer);
    if (examMode && onAnswerChange) {
      onAnswerChange(answer);
    }
  };

  const handleSubmit = async () => {
    if (userAnswer === undefined || userAnswer === null || userAnswer === '') return;

    // In exam mode, just save the answer
    if (examMode) {
      if (onAnswerChange) {
        onAnswerChange(userAnswer);
      }
      return;
    }

    // Normal practice mode - submit for grading
    try {
      const fullEx = exercise as Exercise;
      const response = await submitMutation.mutateAsync({
        planId,
        nodeId,
        request: {
          exercise_id: fullEx.id,
          answer: typeof userAnswer === 'string' ? userAnswer : JSON.stringify(userAnswer),
          ...(fullEx.type === 'coding' && {
            code: userAnswer as string,
            language: fullEx.correct_answer.language,
          }),
        },
      });

      setResult(response);
      setShowResult(true);

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('Failed to submit attempt:', error);
    }
  };

  const renderExercise = () => {
    const commonProps = {
      answer: userAnswer,
      onAnswerChange: handleAnswerChange,
      onSubmit: handleSubmit,
      isSubmitting: submitMutation.isPending,
      disabled: isCompleted || showResult,
      examMode,
    };

    // In exam mode, correct_answer/rubric are stripped by the backend.
    // Sub-components guard correct_answer access with optional chaining,
    // so casting to Exercise here is safe for type routing.
    const fullExercise = exercise as Exercise;
    switch (fullExercise.type) {
      case 'mcq':
        return <MCQExercise exercise={fullExercise} {...commonProps} />;
      case 'short_answer':
        return <ShortAnswerExercise exercise={fullExercise} {...commonProps} />;
      case 'fill_blank':
        return <FillBlankExercise exercise={fullExercise} {...commonProps} />;
      case 'coding':
        return <CodingExercise exercise={fullExercise} {...commonProps} />;
      case 'flashcard':
        return <FlashcardExercise exercise={fullExercise} {...commonProps} />;
      default:
        return <div>Unknown exercise type</div>;
    }
  };

  return (
    <Card className={isCompleted ? 'opacity-60' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant={(EXERCISE_TYPE_TO_BADGE[exercise.type] ?? exercise.type) as 'mcq' | 'shortAnswer' | 'fillBlank' | 'coding' | 'flashcard'}>
              {EXERCISE_TYPE_LABELS[exercise.type] || exercise.type}
            </Badge>
            <Badge variant={DIFFICULTY_VARIANT[exercise.difficulty]}>
              Difficulty {exercise.difficulty}
            </Badge>
          </div>
          {isCompleted && (
            <Badge variant="mastered">Completed</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderExercise()}

        {/* Show result after submission (practice mode only) */}
        {showResult && result && !examMode && (
          <GradeResult result={result} explanation={(exercise as Exercise).rubric} previousMastery={currentMastery} />
        )}
      </CardContent>
    </Card>
  );
}
