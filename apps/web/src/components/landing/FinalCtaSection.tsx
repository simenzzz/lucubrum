/**
 * Closing conversion prompt — repeats the core action lower on the page
 * for visitors who scrolled through the explainer sections first.
 */
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function FinalCtaSection() {
  return (
    <section className="container mx-auto px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
        className="organic-card rounded-2xl border border-border-moderate p-10 md:p-14 text-center max-w-3xl mx-auto"
      >
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-warm-50">
          Ready to shape your path?
        </h2>
        <p className="mt-3 text-warm-200 max-w-xl mx-auto">
          Type any topic and get a prerequisite-ordered roadmap in seconds — free to start.
        </p>
        <Button variant="primary" size="lg" asChild className="mt-8">
          <a href="#topic-input">
            <Sparkles className="w-4 h-4" />
            Start your roadmap
          </a>
        </Button>
      </motion.div>
    </section>
  );
}
