import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { LayoutNode } from '@/lib/dagLayout';
import { EXERCISE_MASTERY_CAP, MASTERY_THRESHOLD } from '@/constants/mastery';
import {
  NODE_STATUS_CONFIG,
  masteryTextColor,
  masteryBarGradient,
  type NodeStatus,
} from '@/constants/statusConfig';
import { Badge } from '@/components/ui/badge';

export type { NodeStatus };

interface GraphNodeProps {
  layoutNode: LayoutNode;
  status: NodeStatus;
  mastery: number;
  isSelected: boolean;
  onClick: () => void;
  hasExamAttempt?: boolean;
}

export function GraphNode({
  layoutNode,
  status,
  mastery,
  isSelected,
  onClick,
  hasExamAttempt = false,
}: GraphNodeProps) {
  const { node } = layoutNode;
  const config = NODE_STATUS_CONFIG[status];
  const StatusIcon = config.icon;
  const isInteractive = status !== 'locked';

  return (
    <motion.div
      className={cn(
        'absolute w-[220px] rounded-2xl border-2 overflow-hidden',
        'bg-hearth-800',
        'transition-all duration-300',
        config.border,
        config.glow,
        status === 'locked' && 'opacity-50',
        isInteractive && 'cursor-pointer',
        isSelected && [
          'ring-2 ring-amber ring-offset-2 ring-offset-hearth-900',
          'shadow-[0_0_40px_rgba(212,165,90,0.25)]',
          'scale-105 z-10',
        ]
      )}
      style={{
        left: layoutNode.x - 110,
        top: layoutNode.y - 50,
      }}
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: status === 'locked' ? 0.5 : 1, y: 0, scale: isSelected ? 1.05 : 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      whileHover={isInteractive && !isSelected ? {
        scale: 1.02,
        y: -2,
        transition: { duration: 0.2 },
      } : undefined}
      whileTap={isInteractive ? { scale: 0.98 } : undefined}
      onClick={isInteractive ? onClick : undefined}
      role="button"
      tabIndex={isInteractive ? 0 : -1}
      aria-label={`${node.title} - ${status.replace('_', ' ')}`}
      onKeyDown={(e) => {
        if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Content */}
      <div className="relative p-4">
        {/* Status badge */}
        <div className={cn(
          'absolute -top-0.5 right-3 p-1.5 rounded-full border border-border-subtle',
          'shadow-sm',
          config.iconBg
        )}>
          <StatusIcon
            className={cn('w-3.5 h-3.5', status === 'in_progress' && 'animate-spin')}
            style={status === 'in_progress' ? { animationDuration: '3s' } : undefined}
          />
        </div>

        {/* "Ready for Exam" nudge badge */}
        {mastery >= EXERCISE_MASTERY_CAP &&
         mastery < MASTERY_THRESHOLD &&
         !hasExamAttempt && (
          <div className="absolute -bottom-2 left-3 animate-pulse">
            <Badge variant="examReady" className="text-[10px] px-1.5 py-0.5">Exam ready</Badge>
          </div>
        )}

        {/* Title */}
        <h3 className="font-heading text-sm font-semibold text-warm-50 leading-snug line-clamp-2 pr-6 mb-3">
          {node.title}
        </h3>

        {/* Mastery progress */}
        {status !== 'locked' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-warm-400 font-medium">Mastery</span>
              <span className={cn('font-mono font-semibold', masteryTextColor(mastery))}>
                {Math.round(mastery * 100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-hearth-700 shadow-inner">
              <motion.div
                className={cn('h-full rounded-full', masteryBarGradient(mastery))}
                initial={{ width: 0 }}
                animate={{ width: `${mastery * 100}%` }}
                transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
              />
            </div>
          </div>
        )}

        {/* Bottom meta row */}
        <div className="flex items-center justify-end mt-3 pt-2 border-t border-border-subtle">
          <span className="text-xs text-warm-400 font-mono">
            ~{node.estimated_minutes}m
          </span>
        </div>
      </div>
    </motion.div>
  );
}
