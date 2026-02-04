import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, Trophy, Loader2 } from 'lucide-react';
import { useRoadmapStore } from '@/stores/roadmapStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ExerciseCard } from '@/components/exercises/ExerciseCard';
import type { PlanNode } from '@/types/api.types';

interface ExamTabProps {
  node: PlanNode;
  planId: string;
  mastery: number;
}

export function ExamTab({ node, planId, mastery }: ExamTabProps) {
  const {
    examState,
    isExamInProgress,
    startExam,
    setExamAnswer,
    nextExamQuestion,
    prevExamQuestion,
    goToExamQuestion,
    completeExam,
    cancelExam,
    getUnansweredCount,
  } = useRoadmapStore();

  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Timer effect
  useEffect(() => {
    if (!examState || examState.isComplete) return;

    const elapsed = (Date.now() - examState.startedAt.getTime()) / 1000;
    const remaining = examState.timeLimitSeconds - elapsed;

    if (remaining <= 0) {
      handleSubmit();
      return;
    }

    setTimeRemaining(Math.floor(remaining));

    const interval = setInterval(() => {
      const newElapsed = (Date.now() - examState.startedAt.getTime()) / 1000;
      const newRemaining = examState.timeLimitSeconds - newElapsed;

      if (newRemaining <= 0) {
        clearInterval(interval);
        handleSubmit();
      } else {
        setTimeRemaining(Math.floor(newRemaining));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [examState]);

  const handleStartExam = async () => {
    setIsStarting(true);
    try {
      // TODO: Call actual exam start API
      // For now, mock the exam start
      const mockExercises = Array.from({ length: 10 }, (_, i) => ({
        id: `exam-${i + 1}`,
        type: 'mcq' as const,
        question: `Sample exam question ${i + 1} for ${node.title}`,
        difficulty: (Math.floor(mastery * 5) + 1) as 1 | 2 | 3 | 4 | 5,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correct_answer: 'Option A',
      }));

      startExam({
        sessionId: `exam-session-${Date.now()}`,
        exercises: mockExercises,
        examDifficulty: mastery + 0.1,
        timeLimitSeconds: 1800, // 30 minutes
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleSubmit = async () => {
    if (!examState) return;

    setIsSubmitting(true);
    try {
      // TODO: Call actual exam submit API
      completeExam();
      setShowResults(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel the exam? Your progress will be lost.')) {
      cancelExam();
      setShowResults(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Show results screen
  if (showResults && examState?.isComplete) {
    const score = examState.exercises.length > 0
      ? examState.answers.size / examState.exercises.length
      : 0;

    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gold/20 flex items-center justify-center">
            <Trophy className="w-10 h-10 text-gold" />
          </div>
          <h3 className="font-heading text-2xl font-semibold text-ink mb-2">Exam Complete!</h3>
          <p className="text-ink/60">
            You answered {examState.answers.size} of {examState.exercises.length} questions
          </p>
        </div>

        <div className="p-6 rounded-lg bg-parchment-dark/50 border border-gold/20">
          <div className="flex items-center justify-between mb-4">
            <span className="text-ink/70">Your Score</span>
            <span className="font-heading text-3xl font-bold text-gold">
              {Math.round(score * 100)}%
            </span>
          </div>
          <Progress value={score * 100} />
          <p className="text-sm text-ink/50 mt-3">
            Mastery update will be calculated when the backend exam API is implemented.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => {
              setShowResults(false);
              cancelExam();
            }}
            variant="outline"
            className="flex-1"
          >
            Back to Practice
          </Button>
          <Button onClick={handleStartExam} variant="primary" className="flex-1">
            Take Another Exam
          </Button>
        </div>
      </div>
    );
  }

  // Show exam in progress
  if (isExamInProgress && examState) {
    const currentExercise = examState.exercises[examState.currentIndex];
    const progress = ((examState.currentIndex + 1) / examState.exercises.length) * 100;
    const isLowTime = timeRemaining !== null && timeRemaining < 300; // 5 minutes

    return (
      <div className="space-y-4">
        {/* Exam header */}
        <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-parchment-dark/50 border border-gold/20">
          <div className="flex items-center gap-3">
            <Badge variant={isLowTime ? 'hard' : 'secondary'}>
              <Clock className="w-3 h-3 mr-1" />
              {timeRemaining !== null ? formatTime(timeRemaining) : '--:--'}
            </Badge>
            <span className="text-sm text-ink/60">
              Question {examState.currentIndex + 1} of {examState.exercises.length}
            </span>
          </div>
          <Button onClick={handleCancel} variant="ghost" size="sm">
            Cancel Exam
          </Button>
        </div>

        {/* Progress bar */}
        <Progress value={progress} />

        {/* Question navigation */}
        <div className="flex items-center gap-1 flex-wrap">
          {examState.exercises.map((_, index) => (
            <button
              key={index}
              onClick={() => goToExamQuestion(index)}
              className={`w-7 h-7 rounded text-xs font-medium transition-all ${
                index === examState.currentIndex
                  ? 'bg-gold text-ink'
                  : examState.answers.has(examState.exercises[index].id)
                    ? 'bg-ocean/20 text-ocean border border-ocean/30'
                    : 'bg-parchment-dark text-ink/50 hover:bg-gold/10'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {/* Current exercise (exam mode - no feedback) */}
        {currentExercise && (
          <ExerciseCard
            exercise={currentExercise}
            planId={planId}
            nodeId={node.node_id}
            examMode
            savedAnswer={examState.answers.get(currentExercise.id)}
            onAnswerChange={(answer) => setExamAnswer(currentExercise.id, answer)}
          />
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-4">
          <Button
            onClick={prevExamQuestion}
            disabled={examState.currentIndex === 0}
            variant="outline"
          >
            Previous
          </Button>

          {examState.currentIndex === examState.exercises.length - 1 ? (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              variant="primary"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Submit Exam ({getUnansweredCount()} unanswered)
            </Button>
          ) : (
            <Button onClick={nextExamQuestion} variant="primary">
              Next
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Show exam start screen
  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gold/20 flex items-center justify-center">
          <Clock className="w-8 h-8 text-gold" />
        </div>
        <h3 className="font-heading text-xl font-semibold text-ink mb-2">Ready for an Exam?</h3>
        <p className="text-ink/60 max-w-md mx-auto">
          Test your knowledge with a timed exam. You'll have 30 minutes to answer 10 questions.
          Your mastery score will be updated based on your performance.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-gold/5 border border-gold/20">
        <h4 className="font-medium text-ink mb-3">Exam Details</h4>
        <ul className="space-y-2 text-sm text-ink/70">
          <li className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gold" />
            <span>Time limit: 30 minutes</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-4 h-4 flex items-center justify-center text-gold font-bold">10</span>
            <span>Questions: 10</span>
          </li>
          <li className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gold" />
            <span>No feedback until you submit</span>
          </li>
        </ul>
      </div>

      <div className="flex items-center justify-between p-4 rounded-lg bg-parchment-dark/50">
        <div>
          <div className="text-sm text-ink/60">Current Mastery</div>
          <div className="font-heading text-lg font-semibold text-ink">
            {Math.round(mastery * 100)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-ink/60">Target Difficulty</div>
          <div className="font-heading text-lg font-semibold text-gold">
            {Math.round((mastery + 0.1) * 100)}%
          </div>
        </div>
      </div>

      <Button
        onClick={handleStartExam}
        disabled={isStarting}
        variant="primary"
        className="w-full"
        size="lg"
      >
        {isStarting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : null}
        Start Exam
      </Button>

      <p className="text-xs text-center text-ink/40">
        Note: Full exam functionality requires the backend exam API to be implemented.
      </p>
    </div>
  );
}
