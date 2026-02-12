import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Map, Sparkles } from 'lucide-react';
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
        <div className="w-32 h-32 rounded-full bg-amber/10 flex items-center justify-center">
          <Map className="w-16 h-16 text-amber/50" />
        </div>
        <motion.div
          className="absolute -top-2 -right-2"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        >
          <Sparkles className="w-8 h-8 text-amber" />
        </motion.div>
      </div>

      {/* Text */}
      <h2 className="font-heading text-2xl font-semibold text-warm-50 mb-2 text-center">
        Start Your Learning Journey
      </h2>
      <p className="text-warm-400 text-center max-w-md mb-8">
        You haven't created any learning roadmaps yet. Get started by
        creating your first personalized learning path.
      </p>

      {/* CTA */}
      <Link to="/">
        <Button variant="primary" size="lg">
          <Sparkles className="w-5 h-5 mr-2" />
          Create Your First Roadmap
        </Button>
      </Link>

      {/* Decorative dots */}
      <div className="flex gap-2 mt-8">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-amber/30"
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
