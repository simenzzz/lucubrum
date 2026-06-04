import { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle, Trophy, Loader2, Lightbulb, CheckCircle, XCircle } from 'lucide-react';
import { useRoadmapStore } from '@/stores/roadmapStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExerciseCard } from '@/components/exercises/ExerciseCard';
import { EXERCISE_MASTERY_CAP, MASTERY_THRESHOLD } from '@/constants/mastery';
import { useStartExam, useSubmitExam } from '@/hooks/usePlan';
import type { PlanNode, ExamAnswer } from '@/types/api.types';

interface ExamTabProps {
  node: PlanNode;
  planId: string;
  mastery: number;
}

export function ExamTab({ node, planId, mastery }: ExamTabProps) {
  const {
    examState,
    isExamInProgress,
    examExpiredNeedsSubmit,
    startExam,
    setExamAnswer,
    nextExamQuestion,
    prevExamQuestion,
    goToExamQuestion,
    completeExam,
    cancelExam,
    getUnansweredCount,
    clearExamExpiredFlag,
  } = useRoadmapStore();

  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const startExamMutation = useStartExam();
  const submitExamMutation = useSubmitExam();

  // Stable ref to always-current handleSubmit, to avoid stale closures in the timer
  const handleSubmitRef = useRef<() => Promise<void>>(async () => {});

  // Keep ref pointing to the latest handleSubmit on every render
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  // Guard: on mount, clear stale exam state (wrong node or completed exam)
  useEffect(() => {
    const state = useRoadmapStore.getState();
    const { examState: currentExamState } = state;
    if (!currentExamState) return;

    const isDifferentNode = currentExamState.planId !== planId || currentExamState.nodeId !== node.node_id;
    const isStaleCompleted = currentExamState.isComplete;

    if (isDifferentNode || isStaleCompleted) {
      state.clearExamState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-submit expired exam on rehydration (page reload while exam was in progress)
  useEffect(() => {
    if (examExpiredNeedsSubmit && examState && !examState.isComplete) {
      handleSubmitRef.current().finally(() => {
        clearExamExpiredFlag();
      });
    }
  }, [examExpiredNeedsSubmit, examState, clearExamExpiredFlag]);

  // Timer effect — deps narrowed to exam identity fields, not full examState object
  useEffect(() => {
    if (!examState || examState.isComplete) return;

    const elapsed = (Date.now() - examState.startedAt.getTime()) / 1000;
    const remaining = examState.timeLimitSeconds - elapsed;

    if (remaining <= 0) {
      handleSubmitRef.current();
      return;
    }

    const startedAt = examState.startedAt;
    const timeLimitSeconds = examState.timeLimitSeconds;

    setTimeRemaining(Math.floor(remaining));

    const interval = setInterval(() => {
      const newElapsed = (Date.now() - startedAt.getTime()) / 1000;
      const newRemaining = timeLimitSeconds - newElapsed;

      if (newRemaining <= 0) {
        clearInterval(interval);
        handleSubmitRef.current();
      } else {
        setTimeRemaining(Math.floor(newRemaining));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [examState?.sessionId, examState?.isComplete, examState?.timeLimitSeconds]);

  const handleStartExam = async () => {
    setIsStarting(true);
    setStartError(null);
    try {
      const result = await startExamMutation.mutateAsync({ planId, nodeId: node.node_id });
      startExam({
        planId,
        nodeId: node.node_id,
        sessionId: result.session_id,
        exercises: result.exercises,
        examDifficulty: result.exam_difficulty,
        timeLimitSeconds: result.time_limit_seconds,
      });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start exam. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSubmit = async () => {
    if (!examState || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const answers: ExamAnswer[] = Array.from(examState.answers.entries()).map(
        ([exercise_id, user_answer]) => ({
          exercise_id,
          user_answer: user_answer as string | string[] | Record<string, unknown>,
        })
      );
      const result = await submitExamMutation.mutateAsync({
        planId,
        nodeId: node.node_id,
        sessionId: examState.sessionId,
        answers,
      });
      completeExam(result);
      setShowResults(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit exam. Please try again.');
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
    const submitResult = examState.submitResult;
    const score = submitResult ? submitResult.score : 0;
    const correctCount = submitResult ? submitResult.correct_count : 0;
    const totalCount = examState.exercises.length;

    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber/20 flex items-center justify-center">
            <Trophy className="w-10 h-10 text-amber" />
          </div>
          <h3 className="font-heading text-2xl font-semibold text-warm-50 mb-2">Exam Complete!</h3>
          <p className="text-warm-400">
            You answered {correctCount} of {totalCount} questions correctly
          </p>
        </div>

        <div className="p-6 rounded-xl bg-hearth-700/50 border border-border-moderate space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-warm-200">Your Score</span>
            <span className="font-heading text-3xl font-bold text-amber">
              {Math.round(score * 100)}%
            </span>
          </div>
          <Progress value={score * 100} />

          {submitResult && (
            <div className="flex items-center justify-between pt-2 border-t border-border-moderate">
              <span className="text-sm text-warm-400">Mastery Update</span>
              <span className="text-sm font-medium text-warm-200">
                {Math.round(submitResult.mastery_update.old * 100)}%
                {' → '}
                <span className={submitResult.mastery_update.delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {Math.round(submitResult.mastery_update.new * 100)}%
                </span>
                {' '}
                <span className={`text-xs ${submitResult.mastery_update.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ({submitResult.mastery_update.delta >= 0 ? '+' : ''}{Math.round(submitResult.mastery_update.delta * 100)}%)
                </span>
              </span>
            </div>
          )}
        </div>

        {submitResult && submitResult.results.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-warm-200">Question Breakdown</h4>
            {submitResult.results.map((r, index) => (
              <div
                key={r.exercise_id}
                className="p-3 rounded-lg bg-hearth-700/30 border border-border-moderate space-y-1"
              >
                <div className="flex items-center gap-2">
                  {r.is_correct
                    ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  <span className="text-sm text-warm-200">Question {index + 1}</span>
                  <span className="text-xs text-warm-400 ml-auto">{Math.round(r.score * 100)}%</span>
                </div>
                {r.feedback && (
                  <p className="text-xs text-warm-400 pl-6">{r.feedback}</p>
                )}
                {r.misconceptions.length > 0 && (
                  <p className="text-xs text-amber pl-6">
                    Misconception: {r.misconceptions.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

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
        <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-hearth-700/50 border border-border-moderate">
          <div className="flex items-center gap-3">
            <Badge variant={isLowTime ? 'hard' : 'secondary'}>
              <Clock className="w-3 h-3 mr-1" />
              {timeRemaining !== null ? formatTime(timeRemaining) : '--:--'}
            </Badge>
            <span className="text-sm text-warm-400">
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
              key={examState.exercises[index].id}
              onClick={() => goToExamQuestion(index)}
              className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                index === examState.currentIndex
                  ? 'bg-amber text-hearth-900'
                  : examState.answers.has(examState.exercises[index].id)
                    ? 'bg-lavender/20 text-lavender border border-lavender/30'
                    : 'bg-hearth-700 text-warm-400 hover:bg-hearth-600'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {submitError && (
          <Alert className="border-red-500/30 bg-red-500/5">
            <AlertDescription className="text-red-400">{submitError}</AlertDescription>
          </Alert>
        )}

        {/* Current exercise (exam mode - no feedback) */}
        {currentExercise && (
          <ExerciseCard
            key={currentExercise.id}
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
              onClick={() => {
                const unanswered = getUnansweredCount();
                if (unanswered > 0 && !confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) {
                  return;
                }
                handleSubmit();
              }}
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
      {/* Exam nudge alert when mastery is at cap */}
      {mastery >= EXERCISE_MASTERY_CAP && mastery < MASTERY_THRESHOLD && (
        <Alert className="mb-4 border-amber/30 bg-amber/5">
          <Lightbulb className="h-4 w-4 text-amber" />
          <AlertDescription className="text-warm-200">
            You've practiced enough — take the exam to level up mastery beyond {EXERCISE_MASTERY_CAP * 100}%.
          </AlertDescription>
        </Alert>
      )}

      <div className="text-center py-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber/20 flex items-center justify-center">
          <Clock className="w-8 h-8 text-amber" />
        </div>
        <h3 className="font-heading text-xl font-semibold text-warm-50 mb-2">Ready for an Exam?</h3>
        <p className="text-warm-400 max-w-md mx-auto">
          Test your knowledge with a timed exam.
          Your mastery score will be updated based on your performance.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-amber/5 border border-amber/20">
        <h4 className="font-medium text-warm-50 mb-3">Exam Details</h4>
        <ul className="space-y-2 text-sm text-warm-200">
          <li className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber" />
            <span>Time limit: up to 30 minutes</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-4 h-4 flex items-center justify-center text-amber font-bold">?</span>
            <span>Around 10 questions (varies by topic)</span>
          </li>
          <li className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber" />
            <span>No feedback until you submit</span>
          </li>
        </ul>
      </div>

      <div className="flex items-center justify-between p-4 rounded-xl bg-hearth-700/50">
        <div>
          <div className="text-sm text-warm-400">Current Mastery</div>
          <div className="font-heading text-lg font-semibold text-warm-50">
            {Math.round(mastery * 100)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-warm-400">Target Difficulty</div>
          <div className="font-heading text-lg font-semibold text-amber">
            {Math.round((mastery + 0.1) * 100)}%
          </div>
        </div>
      </div>

      {startError && (
        <Alert className="border-red-500/30 bg-red-500/5">
          <AlertDescription className="text-red-400">{startError}</AlertDescription>
        </Alert>
      )}

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
    </div>
  );
}
