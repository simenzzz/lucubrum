import { CheckCircle2, XCircle, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { AttemptResponse } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface GradeResultProps {
  result: AttemptResponse;
  explanation?: string;
  previousMastery?: number;
}

export function GradeResult({ result, explanation, previousMastery }: GradeResultProps) {
  // Access nested fields from new backend response structure
  const isCorrect = result.grade.is_correct;
  const score = result.grade.score;
  const isPartiallyCorrect = !isCorrect && score > 0;
  const masteryScore = result.mastery.score;
  const masteryDelta = masteryScore - (previousMastery ?? masteryScore);

  const getResultColor = () => {
    if (isCorrect) return 'sage';
    if (isPartiallyCorrect) return 'amber';
    return 'rose';
  };

  const getResultIcon = () => {
    if (isCorrect) return <CheckCircle2 className="w-6 h-6 text-sage" />;
    if (isPartiallyCorrect) return <AlertTriangle className="w-6 h-6 text-amber" />;
    return <XCircle className="w-6 h-6 text-rose" />;
  };

  const getResultMessage = () => {
    if (isCorrect) return 'Correct!';
    if (isPartiallyCorrect) return 'Partially Correct';
    return 'Incorrect';
  };

  return (
    <div
      className={cn(
        'p-4 rounded-xl border-2',
        isCorrect
          ? 'bg-sage/5 border-sage/30'
          : isPartiallyCorrect
            ? 'bg-amber/5 border-amber/30'
            : 'bg-rose/5 border-rose/30'
      )}
    >
      {/* Result header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {getResultIcon()}
          <div>
            <h4 className={cn('font-heading font-semibold', `text-${getResultColor()}`)}>
              {getResultMessage()}
            </h4>
            <p className="text-sm text-warm-400">Score: {Math.round(score * 100)}%</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {previousMastery !== undefined && (
            <div className={cn('flex items-center gap-1 text-xs font-medium', masteryDelta > 0 ? 'text-sage' : masteryDelta < 0 ? 'text-rose' : 'text-warm-400')}>
              {masteryDelta > 0 && <TrendingUp className="w-3 h-3" />}
              {masteryDelta < 0 && <TrendingDown className="w-3 h-3" />}
              {masteryDelta > 0 ? '+' : ''}{Math.round(masteryDelta * 100)}%
            </div>
          )}
          <Badge variant={isCorrect ? 'mastered' : isPartiallyCorrect ? 'inProgress' : 'locked'}>
            {Math.round(score * 100)}%
          </Badge>
        </div>
      </div>

      {/* Feedback */}
      {result.grade.feedback && (
        <div className="mb-4">
          <p className="text-sm text-warm-200">{result.grade.feedback}</p>
        </div>
      )}

      {/* Explanation */}
      {explanation && (
        <div className="mb-4 p-3 rounded-lg bg-hearth-700/30">
          <p className="text-xs text-warm-400 mb-1">Explanation</p>
          <p className="text-sm text-warm-200">{explanation}</p>
        </div>
      )}

      {/* Misconceptions */}
      {result.grade.misconceptions && result.grade.misconceptions.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-warm-400 mb-2">Areas to Review</p>
          <ul className="space-y-1">
            {result.grade.misconceptions.map((misconception, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-warm-200">
                <span className="text-rose mt-0.5">•</span>
                {misconception}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Current mastery */}
      <div className="pt-3 border-t border-border-moderate">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-warm-400">Current Mastery</span>
          <span className="text-sm font-medium text-warm-50">
            {Math.round(masteryScore * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-warm-400 w-12">
            {result.mastery.level}
          </span>
          <div className="flex-1 relative">
            <Progress value={masteryScore * 100} className="h-1.5" />
          </div>
          <span className="text-xs font-mono font-medium text-warm-50 w-12 text-right">
            {Math.round(masteryScore * 100)}%
          </span>
        </div>
        <p className="text-xs text-warm-400 mt-1">
          Total attempts: {result.mastery.total_attempts}
        </p>
      </div>
    </div>
  );
}
