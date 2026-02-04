import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { UserPlanSummary } from '@/types/api.types';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface PlanProgressCardProps {
  plan: UserPlanSummary;
}

export function PlanProgressCard({ plan }: PlanProgressCardProps) {
  const progress = plan.node_count > 0
    ? (plan.completed_nodes / plan.node_count) * 100
    : 0;

  return (
    <Link
      to={`/roadmap/${plan.plan_id}`}
      className="block p-4 rounded-lg border border-gold/20 bg-parchment hover:bg-parchment-dark/30 hover:border-gold/40 transition-all group"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-ink truncate group-hover:text-gold transition-colors">
            {plan.topic}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant="secondary"
              size="sm"
              className={cn(
                plan.user_level === 'beginner' && 'bg-forest/20 text-forest',
                plan.user_level === 'intermediate' && 'bg-gold/20 text-gold-muted',
                plan.user_level === 'advanced' && 'bg-terracotta/20 text-terracotta'
              )}
            >
              {plan.user_level}
            </Badge>
            <span className="text-xs text-ink/40">
              {timeAgo(plan.last_accessed_at)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-heading text-lg font-semibold text-gold">
              {Math.round(plan.mastery * 100)}%
            </div>
            <div className="text-xs text-ink/50">
              {plan.completed_nodes}/{plan.node_count}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-ink/30 group-hover:text-gold group-hover:translate-x-1 transition-all" />
        </div>
      </div>

      <div className="mt-3">
        <Progress value={progress} className="h-1.5" />
      </div>
    </Link>
  );
}
