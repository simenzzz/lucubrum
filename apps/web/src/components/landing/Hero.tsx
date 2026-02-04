/**
 * "Chart Your Course" Hero component with compass watermark
 * Antique map meets modern minimalism design
 */
import { motion } from 'framer-motion';

export function Hero() {
  return (
    <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
      {/* Compass watermark - positioned absolutely */}
      <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
        <img
          src="/images/compass-watermark.svg"
          alt=""
          className="w-[800px] h-[800px] max-w-none"
        />
      </div>

      {/* Decorative map lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-10"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="grid"
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 100 0 L 0 0 0 100"
              fill="none"
              stroke="#1A1915"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="max-w-3xl mx-auto space-y-6"
        >
          {/* Main heading */}
          <h1 className="font-heading text-5xl md:text-7xl font-bold text-ink tracking-tight">
            Chart Your
            <span className="block text-gradient-gold mt-2">
              Learning Course
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-ink/70 max-w-2xl mx-auto leading-relaxed">
            Embark on a personalized learning expedition. AI-powered roadmaps with curated
            resources, adaptive exercises, and mastery tracking guide your voyage to
            knowledge.
          </p>

          {/* Decorative compass rose */}
          <motion.div
            className="w-16 h-16 mx-auto mt-8"
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          >
            <svg viewBox="0 0 64 64" className="w-full h-full text-gold">
              <circle
                cx="32"
                cy="32"
                r="30"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
              <polygon
                points="32,8 28,32 32,56 36,32"
                fill="currentColor"
                opacity="0.8"
              />
              <polygon
                points="32,8 28,32 32,24"
                fill="#C45D3A"
              />
              <circle cx="32" cy="32" r="3" fill="#1A1915" />
            </svg>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-6 h-10 rounded-full border-2 border-gold/30 flex items-start justify-center p-2">
            <div className="w-1 h-2 rounded-full bg-gold" />
          </div>
        </motion.div>
      </div>

      {/* Decorative corner elements */}
      <div className="absolute top-8 left-8 w-16 h-16 border-l-2 border-t-2 border-gold/30" />
      <div className="absolute top-8 right-8 w-16 h-16 border-r-2 border-t-2 border-gold/30" />
      <div className="absolute bottom-8 left-8 w-16 h-16 border-l-2 border-b-2 border-gold/30" />
      <div className="absolute bottom-8 right-8 w-16 h-16 border-r-2 border-b-2 border-gold/30" />
    </section>
  );
}
