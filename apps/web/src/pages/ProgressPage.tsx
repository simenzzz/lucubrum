import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Flame, AlertCircle } from 'lucide-react';
import { useUserPlans, useNextNode } from '@/hooks/usePlan';
import { useAuthStore } from '@/stores/authStore';
import { PlanProgressCard } from '@/components/progress/PlanProgressCard';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn, timeAgo } from '@/lib/utils';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function ProgressPage() {
  const { user } = useAuthStore();
  const { data: plansData, isLoading, error } = useUserPlans();

  const derived = useMemo(() => {
    if (!plansData?.plans) {
      return { totalPlans: 0, studiedToday: 0, needsAttention: 0, heroPlan: null, recentlyActive: [], paused: [] };
    }

    const sorted = [...plansData.plans].sort(
      (a, b) => new Date(b.last_accessed_at).getTime() - new Date(a.last_accessed_at).getTime()
    );
    const now = Date.now();
    const heroPlan = sorted[0] ?? null;

    const recentlyActive: typeof sorted = [];
    const paused: typeof sorted = [];
    let studiedToday = heroPlan && now - new Date(heroPlan.last_accessed_at).getTime() < ONE_DAY_MS ? 1 : 0;
    let needsAttention = 0;

    for (let i = 1; i < sorted.length; i++) {
      const plan = sorted[i];
      const age = now - new Date(plan.last_accessed_at).getTime();
      if (age < ONE_DAY_MS) studiedToday++;
      if (age > SEVEN_DAYS_MS) { needsAttention++; paused.push(plan); }
      else recentlyActive.push(plan);
    }

    return { totalPlans: sorted.length, studiedToday, needsAttention, heroPlan, recentlyActive, paused };
  }, [plansData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-hearth-900">
        <div className="container mx-auto px-4 py-8">
          <LoadingSkeleton />
          <p className="text-center text-warm-400 mt-4">Loading your progress...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-hearth-900">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-rose mb-4">Failed to load progress data</p>
            <p className="text-warm-400 text-sm">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { heroPlan, recentlyActive, paused } = derived;

  return (
    <div className="min-h-screen bg-hearth-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-warm-50 mb-2">
            Your Progress
          </h1>
          <p className="text-warm-400">
            {user?.name
              ? `Track your learning journey, ${user.name.split(' ')[0]}`
              : 'Track your learning journey'}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatCard
            label="Total"
            value={derived.totalPlans}
            icon={<BookOpen className="w-4 h-4" />}
          />
          <StatCard
            label="Studied Today"
            value={derived.studiedToday}
            icon={<Flame className="w-4 h-4" />}
            color="amber"
          />
          <StatCard
            label="Needs Attention"
            value={derived.needsAttention}
            icon={<AlertCircle className="w-4 h-4" />}
            color="rose"
          />
        </div>

        {/* Continue Learning Hero */}
        {heroPlan && <HeroCard plan={heroPlan} />}

        {/* Recently Active Section */}
        {recentlyActive.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-warm-400 uppercase tracking-wider mb-3">
              Recently Active
            </h2>
            <div className="space-y-2">
              {recentlyActive.map((plan) => (
                <PlanProgressCard key={plan.plan_id} plan={plan} />
              ))}
            </div>
          </div>
        )}

        {/* Paused Section */}
        {paused.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-warm-400 uppercase tracking-wider mb-3">
              Paused
            </h2>
            <div className="space-y-2">
              {paused.map((plan) => (
                <PlanProgressCard key={plan.plan_id} plan={plan} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!heroPlan && recentlyActive.length === 0 && paused.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-warm-400 mb-2">No learning plans yet</p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-amber hover:underline"
              >
                Create your first roadmap
                <ArrowRight className="w-4 h-4" />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

interface HeroCardProps {
  plan: {
    plan_id: string;
    topic: string;
    user_level: string;
    last_accessed_at: string;
  };
}

function HeroCard({ plan }: HeroCardProps) {
  const { data: next, isError } = useNextNode(plan.plan_id);

  const pct = next?.current_progress.completion_percentage ?? null;
  const nodesCompleted = next?.current_progress.nodes_completed ?? null;
  const totalNodes = next?.current_progress.total_nodes ?? null;

  return (
    <Link
      to={`/roadmap/${plan.plan_id}`}
      className="block mb-8 p-6 rounded-2xl border-2 border-amber/30 bg-gradient-to-br from-amber/10 to-hearth-800 hover:from-amber/20 hover:to-hearth-700/50 transition-all group"
    >
      <div className="flex items-center justify-between gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-semibold text-amber uppercase tracking-wider">Continue Learning</span>
            <Badge
              variant="secondary"
              size="sm"
              className={cn(
                plan.user_level === 'beginner' && 'bg-sage/20 text-sage',
                plan.user_level === 'intermediate' && 'bg-lavender/20 text-lavender',
                plan.user_level === 'advanced' && 'bg-amber/20 text-amber'
              )}
            >
              {plan.user_level}
            </Badge>
            <span className="text-xs text-warm-500">{timeAgo(plan.last_accessed_at)}</span>
          </div>
          <h3 className="font-heading text-xl font-bold text-warm-50 mb-3 group-hover:text-amber transition-colors">
            {plan.topic}
          </h3>
          {pct !== null && totalNodes !== null ? (
            <div className="flex items-center gap-4">
              <Progress value={pct} className="w-48 h-3" />
              <span className="text-sm text-warm-300 tabular-nums">
                {Math.round(pct)}% · {nodesCompleted} / {totalNodes} nodes
              </span>
            </div>
          ) : !isError ? (
            <div className="w-48 h-3 bg-hearth-700 rounded-full animate-pulse" />
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-amber font-semibold">
          Continue
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

function StatCard({
  label,
  value,
  icon,
  color = 'warm',
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: 'warm' | 'amber' | 'rose';
}) {
  const colorClasses = {
    warm: 'bg-warm-400/10 text-warm-400',
    amber: 'bg-amber/10 text-amber',
    rose: 'bg-rose/10 text-rose',
  };

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${colorClasses[color]}`}>
            {icon}
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-heading text-xl font-bold text-warm-50">{value}</span>
            </div>
            <p className="text-[10px] text-warm-500 uppercase tracking-wide">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
