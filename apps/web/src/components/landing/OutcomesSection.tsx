/**
 * "What you'll walk away with" — outcome-framed benefit tiles, color-coded with
 * the same accent tokens used for roadmap node status elsewhere in the app.
 */
import { motion } from 'framer-motion';
import { Compass, Target, ListTree, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Outcome {
  icon: React.ElementType;
  title: string;
  description: string;
  accent: 'sage' | 'amber' | 'lavender' | 'clay';
}

const ACCENT_CLASSES: Record<Outcome['accent'], { bg: string; text: string }> = {
  sage: { bg: 'bg-sage/15', text: 'text-sage' },
  amber: { bg: 'bg-amber/15', text: 'text-amber' },
  lavender: { bg: 'bg-lavender/15', text: 'text-lavender' },
  clay: { bg: 'bg-clay/15', text: 'text-clay' },
};

const OUTCOMES: Outcome[] = [
  {
    icon: Compass,
    title: 'No more random video rabbit holes',
    description: 'Resources are relevance-ranked from real YouTube search results, not a generic playlist.',
    accent: 'amber',
  },
  {
    icon: Target,
    title: 'Structured mastery, not guesswork',
    description: 'Every node tracks a 0–100% mastery score, so you always know what you actually know.',
    accent: 'sage',
  },
  {
    icon: ListTree,
    title: 'Learn in the right order',
    description: 'Topics unlock as prerequisites are mastered — no hitting a wall from a missing fundamental.',
    accent: 'lavender',
  },
  {
    icon: ShieldCheck,
    title: 'Proof you actually know it',
    description: 'Timed exams push you past the practice-only cap, so mastery reflects real recall, not lucky guesses.',
    accent: 'clay',
  },
];

export function OutcomesSection() {
  return (
    <section className="container mx-auto px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-2xl mx-auto mb-12"
      >
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-warm-50">
          What you'll walk away with
        </h2>
        <p className="mt-3 text-warm-200">
          Not just a checklist — a measurable, ordered path to actually knowing the material.
        </p>
      </motion.div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
        {OUTCOMES.map((outcome, i) => {
          const accent = ACCENT_CLASSES[outcome.accent];
          return (
            <motion.div
              key={outcome.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
            >
              <Card className="h-full">
                <CardContent className="pt-6">
                  <div className={cn('inline-flex p-2.5 rounded-xl mb-4', accent.bg)}>
                    <outcome.icon className={cn('w-5 h-5', accent.text)} />
                  </div>
                  <h3 className="font-heading text-base font-semibold text-warm-50 mb-2">{outcome.title}</h3>
                  <p className="text-sm text-warm-200">{outcome.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
