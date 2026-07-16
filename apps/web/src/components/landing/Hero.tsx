/**
 * Hero component with warm radial gradient and organic styling
 */
import { motion } from 'framer-motion';
import { RoadmapPreview } from './RoadmapPreview';

export function Hero() {
  return (
    <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
      {/* Warm radial gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-hearth-800 via-hearth-900 to-hearth-900" />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(212,165,90,0.15), transparent 70%)',
        }}
      />

      {/* Subtle dot grid */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="hero-dots"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="12" cy="12" r="1" fill="#D4A55A" opacity="0.06" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-dots)" />
      </svg>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="max-w-3xl mx-auto space-y-6"
        >
          {/* Main heading */}
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold text-warm-50 tracking-tight">
            Shape Your
            <span className="block text-gradient-amber mt-2">
              Learning Path
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base md:text-lg text-warm-200 max-w-2xl mx-auto leading-relaxed">
            Build a personalized learning roadmap powered by AI. Curated resources,
            adaptive exercises, and mastery tracking to guide your growth.
          </p>
        </motion.div>

        <RoadmapPreview />
        <p className="mt-4 text-xs text-warm-400 uppercase tracking-wide text-center">
          Example roadmap — yours is generated from your topic
        </p>
        {/* The scroll cue lives in LandingPage, below the topic input, so the
            input's -mt-20 overlap never collides with it */}
      </div>
    </section>
  );
}
