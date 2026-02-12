import { CheckCircle2, XCircle, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { AttemptResponse } from '@/types/api.types';
import { cn } from '@/lib/utils';

interface GradeResultProps {
  result: AttemptResponse;
  explanation?: string;
}

export function GradeResult({ result, explanation }: GradeResultProps) {
  const masteryDelta = result.mastery_after - result.mastery_before;
  const isCorrect = result.is_correct;
  const isPartiallyCorrect = !isCorrect && result.score > 0;

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
            <p className="text-sm text-warm-400">Score: {Math.round(result.score * 100)}%</p>
          </div>
        </div>
        <Badge variant={isCorrect ? 'mastered' : isPartiallyCorrect ? 'inProgress' : 'locked'}>
          {Math.round(result.score * 100)}%
        </Badge>
      </div>

      {/* Feedback */}
      {result.feedback && (
        <div className="mb-4">
          <p className="text-sm text-warm-200">{result.feedback}</p>
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
      {result.misconceptions && result.misconceptions.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-warm-400 mb-2">Areas to Review</p>
          <ul className="space-y-1">
            {result.misconceptions.map((misconception, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-warm-200">
                <span className="text-rose mt-0.5">•</span>
                {misconception}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mastery update */}
      <div className="pt-3 border-t border-border-moderate">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-warm-400">Mastery Update</span>
          <div className="flex items-center gap-1">
            {masteryDelta > 0 ? (
              <TrendingUp className="w-4 h-4 text-sage" />
            ) : masteryDelta < 0 ? (
              <TrendingDown className="w-4 h-4 text-rose" />
            ) : null}
            <span
              className={cn(
                'text-sm font-mono font-medium',
                masteryDelta > 0 ? 'text-sage' : masteryDelta < 0 ? 'text-rose' : 'text-warm-400'
              )}
            >
              {masteryDelta > 0 ? '+' : ''}
              {Math.round(masteryDelta * 100)}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-warm-400 w-12">
            {Math.round(result.mastery_before * 100)}%
          </span>
          <div className="flex-1 relative">
            <Progress value={result.mastery_before * 100} className="h-1.5" />
            <Progress
              value={result.mastery_after * 100}
              className="h-1.5 absolute inset-0"
              indicatorClassName={cn(
                'transition-all duration-1000',
                result.mastery_after > result.mastery_before ? 'bg-sage' : 'bg-rose'
              )}
            />
          </div>
          <span className="text-xs font-medium text-warm-50 w-12 text-right">
            {Math.round(result.mastery_after * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
