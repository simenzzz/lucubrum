import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, BookOpen, ChevronRight, Sparkles, Layers, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { UserPlanSummary } from '@/types/api.types';
import { timeAgo, cn, SIZE_BADGES, LEVEL_BADGES } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { useNextNode } from '@/hooks/usePlan';

interface LogbookCardProps {
  plan: UserPlanSummary;
  index?: number;
}

// LEVEL_BADGES stores icon names (it's also consumed by PlanConfigForm);
// map them to components here.
const LEVEL_ICONS: Record<string, LucideIcon> = {
  seedling: Sparkles,
  layers: Layers,
  star: Star,
};

export function LogbookCard({ plan, index = 0 }: LogbookCardProps) {
  const levelBadge =
    LEVEL_BADGES[plan.user_level as keyof typeof LEVEL_BADGES] ?? LEVEL_BADGES.beginner;
  const LevelIcon = LEVEL_ICONS[levelBadge.icon] ?? Sparkles;

  // Per-plan completion (also powers the roadmap page's "next node" hint)
  const { data: next, isLoading: progressLoading } = useNextNode(plan.plan_id);
  const pct = next?.current_progress.completion_percentage ?? null;
  const nodesCompleted = next?.current_progress.nodes_completed ?? null;
  const totalNodes = next?.current_progress.total_nodes ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.06,
        duration: 0.5,
        ease: [0.4, 0, 0.2, 1],
      }}
      className="group"
    >
      <Link to={`/roadmap/${plan.plan_id}`} className="block">
        <motion.div
          className={cn(
            'relative rounded-2xl overflow-hidden',
            'border border-border-moderate bg-hearth-800',
            'transition-all duration-300 ease-out',
            'hover:border-amber/40 hover:shadow-glow-amber',
          )}
          whileHover={{
            y: -2,
            transition: { duration: 0.2, ease: 'easeOut' },
          }}
        >
          {/* Top accent stripe */}
          <div className={cn('h-1 w-full bg-gradient-to-r', levelBadge.gradient)} />

          {/* Content */}
          <div className="relative p-5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-heading text-lg font-semibold text-warm-50 leading-tight line-clamp-2 group-hover:text-amber transition-colors duration-300">
                  {plan.topic}
                </h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    'bg-gradient-to-r text-hearth-900',
                    levelBadge.gradient
                  )}>
                    <LevelIcon className="w-3 h-3" />
                    {levelBadge.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-xs text-warm-400 mb-4">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                {SIZE_BADGES[plan.plan_size as keyof typeof SIZE_BADGES]?.label ?? plan.plan_size}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Last accessed {timeAgo(plan.last_accessed_at)}
              </span>
            </div>

            {/* Completion */}
            {progressLoading ? (
              <div className="h-2 w-full bg-hearth-700 rounded-full animate-pulse" />
            ) : pct !== null && totalNodes !== null ? (
              <div className="flex items-center gap-3">
                <Progress value={pct} className="flex-1 h-2" />
                <span className="text-xs text-warm-400 tabular-nums">
                  {nodesCompleted}/{totalNodes} nodes
                </span>
              </div>
            ) : null}

            {/* Divider */}
            <div className="my-4 h-px bg-gradient-to-r from-transparent via-border-moderate to-transparent" />

            {/* Footer */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-warm-600">
                Started {timeAgo(plan.started_at)}
              </span>
              <motion.span
                className="flex items-center gap-1 text-sm font-semibold text-amber"
                initial={{ x: 0 }}
                whileHover={{ x: 4 }}
              >
                Continue
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </motion.span>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}
