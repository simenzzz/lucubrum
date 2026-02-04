import { motion } from 'framer-motion';
import { Lock, Compass, CheckCircle2, Loader2 } from 'lucide-react';
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
  bgClass: string;
  glowClass: string;
  iconBg: string;
}> = {
  locked: {
    icon: <Lock className="w-3.5 h-3.5" />,
    borderClass: 'border-locked/30',
    bgClass: 'from-parchment-dark/80 to-parchment-dark',
    glowClass: '',
    iconBg: 'bg-locked/20 text-locked',
  },
  available: {
    icon: <Compass className="w-3.5 h-3.5 animate-pulse" />,
    borderClass: 'border-gold',
    bgClass: 'from-parchment via-parchment to-parchment-dark/30',
    glowClass: 'shadow-[0_0_30px_rgba(196,160,82,0.25)]',
    iconBg: 'bg-gold/20 text-gold',
  },
  in_progress: {
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />,
    borderClass: 'border-ocean',
    bgClass: 'from-parchment via-parchment to-ocean/5',
    glowClass: 'shadow-[0_0_20px_rgba(45,74,94,0.2)]',
    iconBg: 'bg-ocean/20 text-ocean',
  },
  mastered: {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    borderClass: 'border-forest',
    bgClass: 'from-parchment via-parchment to-forest/5',
    glowClass: '',
    iconBg: 'bg-forest/20 text-forest',
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
        'absolute w-[220px] rounded-xl border-2 overflow-hidden',
        'transition-all duration-300 ease-out',
        config.borderClass,
        config.glowClass,
        status === 'locked' && 'opacity-50 grayscale-[0.3]',
        isInteractive && 'cursor-pointer',
        isSelected && [
          'ring-2 ring-gold ring-offset-2 ring-offset-parchment',
          'shadow-[0_0_40px_rgba(196,160,82,0.4)]',
          'scale-105 z-10',
        ]
      )}
      style={{
        left: layoutNode.x - 110,
        top: layoutNode.y - 50,
      }}
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: status === 'locked' ? 0.5 : 1, y: 0, scale: isSelected ? 1.05 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      whileHover={isInteractive && !isSelected ? {
        scale: 1.03,
        y: -4,
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
      {/* Parchment background with corner wear effect */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br',
        config.bgClass
      )} />

      {/* Corner wear overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 0 0, rgba(220,210,185,0.4) 0%, transparent 30%),
            radial-gradient(circle at 100% 100%, rgba(220,210,185,0.3) 0%, transparent 25%)
          `,
        }}
      />

      {/* Top accent line */}
      <div className={cn(
        'absolute top-0 left-0 right-0 h-1',
        status === 'locked' && 'bg-locked/30',
        status === 'available' && 'bg-gradient-to-r from-gold via-gold-muted to-gold',
        status === 'in_progress' && 'bg-gradient-to-r from-ocean via-ocean-light to-ocean',
        status === 'mastered' && 'bg-gradient-to-r from-forest via-forest to-forest',
      )} />

      {/* Content */}
      <div className="relative p-4 pt-5">
        {/* Status badge */}
        <div className={cn(
          'absolute -top-3 right-3 p-1.5 rounded-full border border-gold/20',
          'shadow-md backdrop-blur-sm',
          config.iconBg
        )}>
          {config.icon}
        </div>

        {/* Title */}
        <h3 className="font-heading text-sm font-semibold text-ink leading-snug line-clamp-2 pr-6 mb-3">
          {node.title}
        </h3>

        {/* Mastery progress */}
        {status !== 'locked' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink/50 font-medium">Mastery</span>
              <span className={cn(
                'font-mono font-semibold',
                mastery >= 0.7 ? 'text-forest' : mastery >= 0.3 ? 'text-gold-muted' : 'text-terracotta'
              )}>
                {Math.round(mastery * 100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-parchment-dark/50 shadow-inner">
              <motion.div
                className={cn(
                  'h-full rounded-full',
                  mastery >= 0.7
                    ? 'bg-gradient-to-r from-forest to-forest/80'
                    : mastery >= 0.3
                      ? 'bg-gradient-to-r from-gold to-gold-muted'
                      : 'bg-gradient-to-r from-terracotta to-terracotta/80'
                )}
                initial={{ width: 0 }}
                animate={{ width: `${mastery * 100}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
              />
            </div>
          </div>
        )}

        {/* Bottom meta row */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gold/10">
          {/* Difficulty stars */}
          <div className="flex items-center gap-0.5" aria-label={`Difficulty: ${node.difficulty} of 5`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <svg
                key={i}
                className={cn(
                  'w-3 h-3 transition-colors',
                  i < node.difficulty ? 'text-gold' : 'text-parchment-dark'
                )}
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
              </svg>
            ))}
          </div>

          {/* Time estimate */}
          <span className="text-xs text-ink/40 font-mono">
            ~{node.estimated_minutes}m
          </span>
        </div>
      </div>

      {/* Hover shine effect */}
      {isInteractive && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)',
          }}
        />
      )}
    </motion.div>
  );
}
