/**
 * Interactive Learn / Practice / Exam preview — uses the same Tabs
 * primitive and tab icons as the real NodePopup, with static mock content
 * (no live API calls) so a visitor can click through the actual UI shape.
 */
import { motion } from 'framer-motion';
import {
  BookOpen,
  Dumbbell,
  GraduationCap,
  Play,
  Clock,
  User,
  CheckCircle2,
  Lock,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const MCQ_OPTIONS = [
  { label: 'It runs in constant time regardless of input size', correct: false },
  { label: 'It grows proportionally with the logarithm of the input size', correct: true },
  { label: 'It always requires quadratic time', correct: false },
  { label: 'It depends only on available memory', correct: false },
];

function LearnPreview() {
  return (
    <div className="space-y-3">
      {[
        { title: 'Big-O Notation Explained Simply', channel: 'CS Fundamentals', duration: '12:34', match: 94 },
        { title: 'Time Complexity in 15 Minutes', channel: 'Algo Academy', duration: '15:02', match: 87 },
      ].map((video) => (
        <Card key={video.title} className="overflow-hidden">
          <div className="flex gap-4 p-3">
            <div className="relative flex-shrink-0 w-32 sm:w-40 h-20 sm:h-24 rounded-lg overflow-hidden bg-gradient-to-br from-hearth-600 to-hearth-700 flex items-center justify-center">
              <Play className="w-7 h-7 text-warm-400" />
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-hearth-900/80 text-warm-50 text-[10px] rounded font-mono">
                {video.duration}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h5 className="font-medium text-sm text-warm-50 line-clamp-2">{video.title}</h5>
              <div className="flex items-center gap-3 mt-2 text-xs text-warm-400">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {video.channel}
                </span>
              </div>
              <div className="mt-2">
                <Badge variant="secondary" size="sm">
                  {video.match}% match
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      ))}
      <p className="text-xs text-warm-400 pt-1">
        Ranked by real YouTube relevance — not hallucinated links.
      </p>
    </div>
  );
}

function PracticePreview() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="mcq">Multiple Choice</Badge>
          <Badge variant="medium">Difficulty 3</Badge>
        </div>
        <p className="text-sm font-medium text-warm-50">
          What does it mean for an algorithm to run in O(log n) time?
        </p>
        <div className="space-y-2">
          {MCQ_OPTIONS.map((option) => (
            <div
              key={option.label}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                option.correct
                  ? 'border-sage bg-sage/10 text-warm-50'
                  : 'border-border-moderate text-warm-200'
              )}
            >
              {option.correct && <CheckCircle2 className="w-4 h-4 text-sage shrink-0" />}
              {option.label}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sage/10 border border-sage/30 text-sm text-sage">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Correct — mastery 48% → 60% (+12%)
        </div>
      </CardContent>
    </Card>
  );
}

function ExamPreview() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-locked/30 bg-hearth-800 opacity-70">
          <Lock className="w-4 h-4 text-locked" />
          <span className="text-sm text-warm-200">Recursion &amp; Complexity</span>
        </div>
        <ArrowRight className="w-4 h-4 text-amber/50" />
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-sage bg-hearth-800 shadow-glow-sage">
          <CheckCircle2 className="w-4 h-4 text-sage" />
          <span className="text-sm text-warm-50">Mastered · 80%+</span>
        </div>
      </div>
      <div className="flex items-center justify-center">
        <Badge variant="outline" size="sm" className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Timed · no feedback until you submit
        </Badge>
      </div>
      <p className="text-xs text-warm-400 text-center max-w-sm mx-auto">
        Practice alone caps mastery at 35%. Passing the exam pushes you past it and unlocks
        dependent topics like this one.
      </p>
    </div>
  );
}

const TABS = [
  { value: 'learn', label: 'Learn', icon: BookOpen, content: <LearnPreview /> },
  { value: 'practice', label: 'Practice', icon: Dumbbell, content: <PracticePreview /> },
  { value: 'exam', label: 'Exam', icon: GraduationCap, content: <ExamPreview /> },
] as const;

export function ProductPreviewSection() {
  return (
    <section className="container mx-auto px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-2xl mx-auto mb-10"
      >
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-warm-50">
          Every node, three ways to learn it
        </h2>
        <p className="mt-3 text-warm-200">
          This is the exact tab layout you get inside your roadmap — try switching between them.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="max-w-xl mx-auto"
      >
        <Tabs defaultValue="learn">
          <TabsList className="w-full grid grid-cols-3 mb-4">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-0">
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </motion.div>

      <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-warm-500">
        <Sparkles className="w-3 h-3" />
        Preview content — your roadmap generates real videos, exercises, and exams
      </div>
    </section>
  );
}
