/**
 * Organic loading animation for plan creation
 */
import { motion } from 'framer-motion';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Generating your personalized learning roadmap...' }: LoadingStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-20"
    >
      {/* Animated concentric rings */}
      <div className="relative w-32 h-32 mb-8">
        {/* Outer ring - rotating */}
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 128 128" className="w-full h-full">
            <circle
              cx="64"
              cy="64"
              r="60"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-amber/30"
            />
            {/* Markers */}
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30) * (Math.PI / 180);
              const x1 = 64 + 56 * Math.cos(angle);
              const y1 = 64 + 56 * Math.sin(angle);
              const x2 = 64 + 60 * Math.cos(angle);
              const y2 = 64 + 60 * Math.sin(angle);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-amber/50"
                />
              );
            })}
          </svg>
        </motion.div>

        {/* Middle ring - counter-rotating */}
        <motion.div
          className="absolute inset-4"
          animate={{ rotate: -360 }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        >
          <svg viewBox="0 0 128 128" className="w-full h-full">
            <circle
              cx="64"
              cy="64"
              r="60"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-lavender/20"
            />
            <circle
              cx="64"
              cy="64"
              r="48"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-lavender/20"
            />
          </svg>
        </motion.div>

        {/* Center pulsing dot */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-6 h-6 rounded-full bg-amber/60" />
        </motion.div>

        {/* Glow effect */}
        <motion.div
          className="absolute inset-0 rounded-full bg-amber/20 blur-xl"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Loading message */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-center space-y-2"
      >
        <p className="text-lg font-heading text-warm-50">{message}</p>
        <motion.p
          className="text-sm text-warm-400"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Building your roadmap...
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
