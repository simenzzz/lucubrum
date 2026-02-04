import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Map, Compass, Anchor } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyLogbook() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      {/* Decorative illustration */}
      <div className="relative mb-8">
        <div className="w-32 h-32 rounded-full bg-gold/10 flex items-center justify-center">
          <Map className="w-16 h-16 text-gold/50" />
        </div>
        <motion.div
          className="absolute -top-2 -right-2"
          animate={{ rotate: [0, 15, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        >
          <Compass className="w-8 h-8 text-gold" />
        </motion.div>
        <motion.div
          className="absolute -bottom-2 -left-2"
          animate={{ y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        >
          <Anchor className="w-6 h-6 text-ocean" />
        </motion.div>
      </div>

      {/* Text */}
      <h2 className="font-heading text-2xl font-semibold text-ink mb-2 text-center">
        Your Voyage Awaits
      </h2>
      <p className="text-ink/60 text-center max-w-md mb-8">
        You haven't charted any learning courses yet. Start your journey by
        creating your first personalized learning roadmap.
      </p>

      {/* CTA */}
      <Link to="/">
        <Button variant="primary" size="lg">
          <Compass className="w-5 h-5 mr-2" />
          Chart Your Course
        </Button>
      </Link>

      {/* Decorative dots */}
      <div className="flex gap-2 mt-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-gold/30"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
