import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, BookOpen, ChevronRight, Sparkles, Layers, Star } from 'lucide-react';
import type { UserPlanSummary } from '@/types/api.types';
import { timeAgo, cn } from '@/lib/utils';

interface LogbookCardProps {
  plan: UserPlanSummary;
  index?: number;
}

const LEVEL_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  beginner: {
    label: 'Beginner',
    color: 'from-sage/80 to-sage',
    icon: <Sparkles className="w-3 h-3" />,
  },
  intermediate: {
    label: 'Intermediate',
    color: 'from-lavender to-lavender/80',
    icon: <Layers className="w-3 h-3" />,
  },
  advanced: {
    label: 'Advanced',
    color: 'from-amber to-amber/80',
    icon: <Star className="w-3 h-3" />,
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
          <div className={cn(
            'h-1 w-full bg-gradient-to-r',
            isComplete ? 'from-sage via-sage to-sage/80' :
            isStarted ? 'from-amber via-amber to-amber/80' :
            'from-lavender via-lavender to-lavender/80'
          )} />

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
                    stroke="#332D27"
                    strokeWidth="5"
                  />
                  {/* Progress */}
                  <motion.circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke={isComplete ? '#8BA888' : '#D4A55A'}
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
                    isComplete ? 'text-sage' : 'text-amber'
                  )}>
                    {Math.round(plan.mastery * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-warm-400">Progress</span>
                <span className="font-mono text-warm-200">
                  {plan.completed_nodes}/{plan.node_count} nodes
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-hearth-700">
                <motion.div
                  className={cn(
                    'h-full rounded-full',
                    isComplete
                      ? 'bg-gradient-to-r from-sage to-sage/80'
                      : 'bg-gradient-to-r from-amber to-amber/80'
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, delay: index * 0.1 + 0.2, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-xs text-warm-400">
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
            <div className="my-4 h-px bg-gradient-to-r from-transparent via-border-moderate to-transparent" />

            {/* Footer */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-warm-600">
                Created {timeAgo(plan.created_at)}
              </span>
              <motion.span
                className="flex items-center gap-1 text-sm font-semibold text-amber"
                initial={{ x: 0 }}
                whileHover={{ x: 4 }}
              >
                {isComplete ? 'Review' : 'Continue'}
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </motion.span>
            </div>
          </div>

          {/* Completion badge */}
          {isComplete && (
            <motion.div
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-sage flex items-center justify-center"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: index * 0.1 + 0.5, type: 'spring', stiffness: 200 }}
            >
              <svg className="w-4 h-4 text-hearth-900" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            </motion.div>
          )}
        </motion.div>
      </Link>
    </motion.div>
  );
}
