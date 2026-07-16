/**
 * Static, non-interactive preview of a generated roadmap — reuses the
 * graph-node visual language (borders, status icons, mastery bars) so a
 * first-time visitor sees the payoff before typing a topic.
 */
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_STATUS_CONFIG, type NodeStatus } from '@/constants/statusConfig';

interface PreviewNode {
  title: string;
  status: NodeStatus | 'capstone';
  mastery: number;
}

const PREVIEW_NODES: PreviewNode[] = [
  { title: 'Fundamentals', status: 'mastered', mastery: 1 },
  { title: 'Core Concepts', status: 'in_progress', mastery: 2 / 3 },
  { title: 'Advanced Topics', status: 'available', mastery: 1 / 3 },
  { title: 'Real Projects', status: 'capstone', mastery: 0 },
];

// Shared node-status visuals plus the landing-only "capstone" destination card.
// Capstone renders as a gradient glow card (see isCapstone branch below), so
// `border` is unused — the gradient wrapper supplies the border.
const STATUS_CONFIG = {
  ...NODE_STATUS_CONFIG,
  capstone: {
    icon: Trophy,
    border: 'border-transparent',
    iconBg: 'bg-rose/20 text-rose-light',
  },
} as const;

export function RoadmapPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="mt-10 flex items-center justify-center gap-1 flex-wrap max-w-3xl mx-auto"
      aria-hidden="true"
    >
      {PREVIEW_NODES.map((node, index) => {
        const config = STATUS_CONFIG[node.status];
        const Icon = config.icon;
        const isCapstone = node.status === 'capstone';

        // Shared inner content so the capstone glow-card and the standard bordered
        // card stay visually identical apart from their borders.
        const inner = (
          <>
            <div className={cn('inline-flex p-1 rounded-full mb-2', config.iconBg)}>
              <Icon className="w-3 h-3" />
            </div>
            <p className="text-xs font-medium text-warm-50 leading-snug mb-2 line-clamp-1">
              {node.title}
            </p>
            <div
              className={cn(
                'h-1 rounded-full overflow-hidden',
                isCapstone ? 'bg-rose/15' : 'bg-hearth-700'
              )}
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  isCapstone
                    ? 'bg-gradient-to-r from-rose to-amber'
                    : node.mastery >= 0.7
                      ? 'bg-sage'
                      : node.mastery > 0
                        ? 'bg-lavender'
                        : 'bg-hearth-600'
                )}
                style={{ width: `${node.mastery * 100}%` }}
              />
            </div>
          </>
        );

        return (
          <div key={node.title} className="flex items-center gap-1">
            {isCapstone ? (
              <div className="w-28 sm:w-36 rounded-xl bg-gradient-to-r from-rose to-amber p-[2px] shadow-glow-rose">
                <div className="rounded-xl bg-hearth-800/80 p-3 text-left">{inner}</div>
              </div>
            ) : (
              <div
                className={cn(
                  'w-28 sm:w-36 rounded-xl border-2 bg-hearth-800/80 p-3 text-left',
                  config.border,
                  node.status === 'locked' && 'opacity-50'
                )}
              >
                {inner}
              </div>
            )}
            {index < PREVIEW_NODES.length - 1 && (
              <div className="w-4 sm:w-8 h-px bg-amber/30 shrink-0" />
            )}
          </div>
        );
      })}
    </motion.div>
  );
}
