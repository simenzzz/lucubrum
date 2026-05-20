import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { UserPlanSummary } from '@/types/api.types';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useNextNode } from '@/hooks/usePlan';

interface PlanProgressCardProps {
  plan: UserPlanSummary;
}

export function PlanProgressCard({ plan }: PlanProgressCardProps) {
  const { data: next, isLoading } = useNextNode(plan.plan_id);

  const pct = next?.current_progress.completion_percentage ?? null;
  const nodesCompleted = next?.current_progress.nodes_completed ?? null;
  const totalNodes = next?.current_progress.total_nodes ?? null;

  return (
    <Link
      to={`/roadmap/${plan.plan_id}`}
      className="block p-4 rounded-xl border border-border-moderate bg-hearth-800 hover:bg-hearth-700/50 hover:border-amber/30 transition-all group"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-warm-50 truncate group-hover:text-amber transition-colors">
            {plan.topic}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant="secondary"
              size="sm"
              className={cn(
                plan.user_level === 'beginner' && 'bg-sage/20 text-sage',
                plan.user_level === 'intermediate' && 'bg-lavender/20 text-lavender',
                plan.user_level === 'advanced' && 'bg-amber/20 text-amber'
              )}
            >
              {plan.user_level}
            </Badge>
            <span className="text-xs text-warm-600">
              {timeAgo(plan.last_accessed_at)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress indicator */}
          {isLoading ? (
            <div className="w-16 h-2 bg-hearth-700 rounded-full animate-pulse" />
          ) : pct !== null && totalNodes !== null ? (
            <div className="flex items-center gap-2">
              <Progress value={pct} className="w-16 h-2" />
              <span className="text-xs text-warm-400 tabular-nums">
                {nodesCompleted}/{totalNodes}
              </span>
            </div>
          ) : null}

          <ChevronRight className="w-5 h-5 text-warm-600 group-hover:text-amber group-hover:translate-x-1 transition-all" />
        </div>
      </div>
    </Link>
  );
}
