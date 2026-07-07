/**
 * "How it works" — 4 real product steps, each with a small live-styled
 * visual borrowed from the actual roadmap/node/mastery visual language.
 */
import { motion } from 'framer-motion';
import { Search, Lock, Sparkles, CheckCircle2, BookOpen, Dumbbell, GraduationCap, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  number: number;
  title: string;
  description: string;
  visual: React.ReactNode;
}

function TopicVisual() {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-hearth-700 border border-border-moderate px-3 py-2.5">
      <Search className="w-4 h-4 text-warm-400 shrink-0" />
      <span className="text-sm text-warm-200 truncate">Quantum Computing</span>
      <Sparkles className="w-3.5 h-3.5 text-amber shrink-0 ml-auto" />
    </div>
  );
}

const MINI_NODES = [
  { icon: CheckCircle2, border: 'border-sage', bg: 'bg-sage/20 text-sage' },
  { icon: Sparkles, border: 'border-amber', bg: 'bg-amber/20 text-amber' },
  { icon: Lock, border: 'border-locked/30', bg: 'bg-locked/20 text-locked' },
] as const;

function RoadmapVisual() {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {MINI_NODES.map((node, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className={cn('p-2 rounded-lg border-2 bg-hearth-800', node.border, node.bg)}>
            <node.icon className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          {i < MINI_NODES.length - 1 && <div className="w-3 h-px bg-amber/30" />}
        </div>
      ))}
    </div>
  );
}

const TAB_PILLS = [
  { icon: BookOpen, label: 'Learn' },
  { icon: Dumbbell, label: 'Practice' },
  { icon: GraduationCap, label: 'Exam' },
] as const;

function TabsVisual() {
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap">
      {TAB_PILLS.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex items-center justify-center gap-1 px-1.5 py-1 rounded-lg bg-hearth-700 border border-border-moderate text-[0.7rem] text-warm-200"
        >
          <Icon className="w-3 h-3 text-amber shrink-0" aria-hidden="true" />
          {label}
        </div>
      ))}
    </div>
  );
}

function MasteryVisual() {
  return (
    <div className="px-1">
      <div className="relative h-2 rounded-full bg-hearth-700 overflow-hidden">
        <div className="h-full w-[80%] rounded-full bg-gradient-to-r from-rose via-amber to-sage" />
        {[35, 60, 80].map((mark) => (
          <div
            key={mark}
            className="absolute top-0 bottom-0 w-px bg-hearth-900/60"
            style={{ left: `${mark}%` }}
          />
        ))}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-warm-300">
        <li className="flex items-center gap-1.5">
          <span className="font-mono text-amber">35%</span> practice cap
        </li>
        <li className="flex items-center gap-1.5">
          <span className="font-mono text-amber">60%</span> unlocks next
        </li>
        <li className="flex items-center gap-1.5">
          <span className="font-mono text-amber">80%</span> mastered
        </li>
      </ul>
    </div>
  );
}

const STEPS: Step[] = [
  {
    number: 1,
    title: 'Type a topic',
    description: 'Any subject — quantum computing, Renaissance art, linear algebra. Free text, no catalog to browse.',
    visual: <TopicVisual />,
  },
  {
    number: 2,
    title: 'Get a validated roadmap',
    description: 'AI generates a prerequisite-ordered roadmap, structurally checked — not just an LLM guess.',
    visual: <RoadmapVisual />,
  },
  {
    number: 3,
    title: 'Learn, practice, exam',
    description: 'Every node has curated videos, adaptive exercises, and a timed exam to prove what you know.',
    visual: <TabsVisual />,
  },
  {
    number: 4,
    title: "Mastery unlocks what's next",
    description: 'Practice alone caps mastery at 35%. Pass the exam to unlock dependent topics.',
    visual: <MasteryVisual />,
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="container mx-auto px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-2xl mx-auto mb-14"
      >
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-warm-50">
          How it works
        </h2>
        <p className="mt-3 text-warm-200">
          Four steps from a blank topic to a roadmap you can actually track mastery against.
        </p>
      </motion.div>

      <div className="flex flex-col md:flex-row gap-4 md:items-stretch max-w-6xl mx-auto">
        {STEPS.map((step, i) => (
          <div key={step.number} className="flex flex-col md:flex-row md:flex-1 items-stretch gap-4">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="organic-card rounded-xl border border-border-moderate p-5 flex-1 flex flex-col"
            >
              <div className="flex items-center gap-2 mb-3 min-h-[2.5rem]">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber/15 text-amber text-xs font-mono font-semibold shrink-0">
                  {step.number}
                </span>
                <h3 className="font-heading font-semibold text-warm-50 text-sm leading-tight">{step.title}</h3>
              </div>
              <p className="text-sm text-warm-200 mb-4 flex-1">{step.description}</p>
              <div className="mt-auto">{step.visual}</div>
            </motion.div>

            {i < STEPS.length - 1 && (
              <ArrowRight
                className="hidden md:block w-4 h-4 text-amber/40 shrink-0 self-center"
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
