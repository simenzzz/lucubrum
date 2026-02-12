import { motion } from 'framer-motion';
import { Lock, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LayoutNode } from '@/lib/dagLayout';

export type NodeStatus = 'locked' | 'available' | 'in_progress' | 'mastered';

interface GraphNodeProps {
  layoutNode: LayoutNode;
  status: NodeStatus;
  mastery: number;
  isSelected: boolean;
  onClick: () => void;
}

const STATUS_CONFIG: Record<NodeStatus, {
  icon: React.ReactNode;
  borderClass: string;
  glowClass: string;
  iconBg: string;
}> = {
  locked: {
    icon: <Lock className="w-3.5 h-3.5" />,
    borderClass: 'border-locked/30',
    glowClass: '',
    iconBg: 'bg-locked/20 text-locked',
  },
  available: {
    icon: <Sparkles className="w-3.5 h-3.5" />,
    borderClass: 'border-amber',
    glowClass: 'shadow-glow-amber',
    iconBg: 'bg-amber/20 text-amber',
  },
  in_progress: {
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />,
    borderClass: 'border-lavender',
    glowClass: 'shadow-glow-lavender',
    iconBg: 'bg-lavender/20 text-lavender',
  },
  mastered: {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    borderClass: 'border-sage',
    glowClass: 'shadow-glow-sage',
    iconBg: 'bg-sage/20 text-sage',
  },
};

export function GraphNode({
  layoutNode,
  status,
  mastery,
  isSelected,
  onClick,
}: GraphNodeProps) {
  const { node } = layoutNode;
  const config = STATUS_CONFIG[status];
  const isInteractive = status !== 'locked';

  return (
    <motion.div
      className={cn(
        'absolute w-[220px] rounded-2xl border-2 overflow-hidden',
        'bg-hearth-800',
        'transition-all duration-300',
        config.borderClass,
        config.glowClass,
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
          {config.icon}
        </div>

        {/* Title */}
        <h3 className="font-heading text-sm font-semibold text-warm-50 leading-snug line-clamp-2 pr-6 mb-3">
          {node.title}
        </h3>

        {/* Mastery progress */}
        {status !== 'locked' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-warm-400 font-medium">Mastery</span>
              <span className={cn(
                'font-mono font-semibold',
                mastery >= 0.7 ? 'text-sage' : mastery >= 0.3 ? 'text-amber' : 'text-rose'
              )}>
                {Math.round(mastery * 100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-hearth-700 shadow-inner">
              <motion.div
                className={cn(
                  'h-full rounded-full',
                  mastery >= 0.7
                    ? 'bg-gradient-to-r from-sage to-sage-light'
                    : mastery >= 0.3
                      ? 'bg-gradient-to-r from-amber to-amber-light'
                      : 'bg-gradient-to-r from-rose to-rose-light'
                )}
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
