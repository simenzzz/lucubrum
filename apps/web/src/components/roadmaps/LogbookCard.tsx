import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, BookOpen, ChevronRight, Anchor, Compass } from 'lucide-react';
import type { UserPlanSummary } from '@/types/api.types';
import { timeAgo, cn } from '@/lib/utils';

interface LogbookCardProps {
  plan: UserPlanSummary;
  index?: number;
}

const LEVEL_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  beginner: {
    label: 'Novice',
    color: 'from-forest/80 to-forest',
    icon: <Anchor className="w-3 h-3" />,
  },
  intermediate: {
    label: 'Voyager',
    color: 'from-gold to-gold-muted',
    icon: <Compass className="w-3 h-3" />,
  },
  advanced: {
    label: 'Navigator',
    color: 'from-terracotta to-terracotta/80',
    icon: <BookOpen className="w-3 h-3" />,
  },
};

export function LogbookCard({ plan, index = 0 }: LogbookCardProps) {
  const progress = plan.node_count > 0
    ? (plan.completed_nodes / plan.node_count) * 100
    : 0;

  const levelConfig = LEVEL_CONFIG[plan.user_level] || LEVEL_CONFIG.beginner;
  const isComplete = progress >= 100;
  const isStarted = plan.completed_nodes > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: -10 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{
        delay: index * 0.08,
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group perspective-1000"
    >
      <Link to={`/roadmap/${plan.plan_id}`} className="block">
        <motion.div
          className={cn(
            'relative rounded-xl overflow-hidden',
            'border border-gold/20',
            'transition-all duration-500 ease-out',
            'hover:border-gold/50',
          )}
          whileHover={{
            y: -8,
            transition: { duration: 0.3, ease: 'easeOut' },
          }}
          style={{
            background: `
              linear-gradient(135deg, rgb(247 243 232) 0%, rgb(242 237 225) 50%, rgb(237 232 218) 100%)
            `,
            boxShadow: `
              0 4px 6px -1px rgb(26 25 21 / 0.1),
              0 2px 4px -2px rgb(26 25 21 / 0.1),
              inset 0 1px 0 rgb(255 255 255 / 0.5)
            `,
          }}
        >
          {/* Aged paper corner effects */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                radial-gradient(circle at 0 0, rgba(220,210,185,0.5) 0%, transparent 30%),
                radial-gradient(circle at 100% 0, rgba(220,210,185,0.3) 0%, transparent 25%),
                radial-gradient(circle at 100% 100%, rgba(220,210,185,0.4) 0%, transparent 30%),
                radial-gradient(circle at 0 100%, rgba(220,210,185,0.3) 0%, transparent 20%)
              `,
            }}
          />

          {/* Top accent stripe */}
          <div className={cn(
            'h-1.5 w-full bg-gradient-to-r',
            isComplete ? 'from-forest via-forest to-forest/80' :
            isStarted ? 'from-gold via-gold-muted to-gold' :
            'from-ocean via-ocean-light to-ocean'
          )} />

          {/* Content */}
          <div className="relative p-5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-heading text-lg font-semibold text-ink leading-tight line-clamp-2 group-hover:text-gold transition-colors duration-300">
                  {plan.topic}
                </h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    'bg-gradient-to-r text-parchment',
                    levelConfig.color
                  )}>
                    {levelConfig.icon}
                    {levelConfig.label}
                  </span>
                </div>
              </div>

              {/* Mastery ring */}
              <div className="relative flex-shrink-0">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  {/* Track */}
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="rgb(232 223 203)"
                    strokeWidth="5"
                  />
                  {/* Progress */}
                  <motion.circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke={isComplete ? 'rgb(74 103 65)' : 'rgb(196 160 82)'}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={176}
                    initial={{ strokeDashoffset: 176 }}
                    animate={{ strokeDashoffset: 176 - (plan.mastery * 176) }}
                    transition={{ duration: 1, delay: index * 0.1 + 0.3, ease: 'easeOut' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={cn(
                    'font-heading text-sm font-bold',
                    isComplete ? 'text-forest' : 'text-gold'
                  )}>
                    {Math.round(plan.mastery * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-ink/50">Progress</span>
                <span className="font-mono text-ink/70">
                  {plan.completed_nodes}/{plan.node_count} nodes
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-parchment-dark/50 shadow-inner">
                <motion.div
                  className={cn(
                    'h-full rounded-full',
                    isComplete
                      ? 'bg-gradient-to-r from-forest to-forest/80'
                      : 'bg-gradient-to-r from-gold to-gold-muted'
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, delay: index * 0.1 + 0.2, ease: 'easeOut' }}
                  style={{
                    boxShadow: isComplete
                      ? '0 0 8px rgba(74, 103, 65, 0.4)'
                      : '0 0 8px rgba(196, 160, 82, 0.4)',
                  }}
                />
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-xs text-ink/50">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                {plan.node_count} nodes
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {timeAgo(plan.last_accessed_at)}
              </span>
            </div>

            {/* Divider */}
            <div className="my-4 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />

            {/* Footer */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink/40">
                Charted {timeAgo(plan.created_at)}
              </span>
              <motion.span
                className="flex items-center gap-1 text-sm font-semibold text-gold"
                initial={{ x: 0 }}
                whileHover={{ x: 4 }}
              >
                {isComplete ? 'Review' : 'Continue'}
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </motion.span>
            </div>
          </div>

          {/* Hover glow effect */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
            style={{
              boxShadow: 'inset 0 0 60px rgba(196, 160, 82, 0.1)',
            }}
          />

          {/* Completion wax seal */}
          {isComplete && (
            <motion.div
              className="absolute top-4 right-4 wax-seal w-10 h-10 text-parchment"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: index * 0.1 + 0.5, type: 'spring', stiffness: 200 }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            </motion.div>
          )}
        </motion.div>
      </Link>
    </motion.div>
  );
}
