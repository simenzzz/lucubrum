/**
 * "How it works" — 4 real product steps, each with a small live-styled
 * visual borrowed from the actual roadmap/node/mastery visual language.
 */
import { Fragment } from 'react';
import { motion } from 'framer-motion';
import { Search, Sparkles, BookOpen, Dumbbell, GraduationCap, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NODE_STATUS_CONFIG } from '@/constants/statusConfig';

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

// Mini roadmap strip reusing the shared node-status visual language
const MINI_NODE_STATUSES = ['mastered', 'available', 'locked'] as const;

function RoadmapVisual() {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {MINI_NODE_STATUSES.map((status, i) => {
        const config = NODE_STATUS_CONFIG[status];
        return (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn('p-2 rounded-lg border-2 bg-hearth-800', config.border, config.iconBg)}>
              <config.icon className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
            {i < MINI_NODE_STATUSES.length - 1 && <div className="w-3 h-px bg-amber/30" />}
          </div>
        );
      })}
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
          className="flex items-center justify-center gap-1 px-1.5 py-1 rounded-lg bg-hearth-700 border border-border-moderate text-xs text-warm-200"
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
        className="text-center max-w-2xl mx-auto mb-12"
      >
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-warm-50">
          How it works
        </h2>
        <p className="mt-3 text-warm-200">
          Four steps from a blank topic to a roadmap you can actually track mastery against.
        </p>
      </motion.div>

      {/* 1 column on mobile, 2x2 at md (4-across is too cramped there), and a
          4-across row with connector arrows at lg. Cards and arrows are grid
          siblings so every card gets an identical column — nesting the arrow
          inside a card wrapper made the last card wider than the rest. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-4 max-w-6xl mx-auto">
        {STEPS.map((step, i) => (
          <Fragment key={step.number}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="organic-card rounded-xl border border-border-moderate p-5 flex flex-col h-full"
            >
              <div className="flex items-center gap-2 mb-3 min-h-[2.5rem]">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber/15 text-amber text-xs font-mono font-semibold shrink-0">
                  {step.number}
                </span>
                <h3 className="font-heading font-semibold text-warm-50 text-sm leading-tight">{step.title}</h3>
              </div>
              <p className="text-sm text-warm-200 mb-4 flex-1">{step.description}</p>
              {/* Fixed-height envelope keeps the four visuals level across cards */}
              <div className="mt-auto flex flex-col justify-center md:min-h-[96px]">{step.visual}</div>
            </motion.div>

            {i < STEPS.length - 1 && (
              <ArrowRight
                className="hidden lg:block w-4 h-4 text-amber/40 shrink-0 self-center"
                aria-hidden="true"
              />
            )}
          </Fragment>
        ))}
      </div>
    </section>
  );
}
