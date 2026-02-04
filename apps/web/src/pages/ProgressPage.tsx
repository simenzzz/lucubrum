import { useMemo } from 'react';
import { TrendingUp, Target, BookOpen, Trophy } from 'lucide-react';
import { useUserPlans } from '@/hooks/usePlan';
import { useAuthStore } from '@/stores/authStore';
import { MasteryOverviewChart } from '@/components/progress/MasteryOverviewChart';
import { ProgressTimelineChart } from '@/components/progress/ProgressTimelineChart';
import { ExerciseStatsChart } from '@/components/progress/ExerciseStatsChart';
import { PlanProgressCard } from '@/components/progress/PlanProgressCard';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ProgressPage() {
  const { user } = useAuthStore();
  const { data: plansData, isLoading, error } = useUserPlans();

  // Aggregate stats from all plans
  const stats = useMemo(() => {
    if (!plansData?.plans) {
      return {
        totalNodes: 0,
        completedNodes: 0,
        overallMastery: 0,
        totalPlans: 0,
        statusDistribution: {
          locked: 0,
          available: 0,
          inProgress: 0,
          mastered: 0,
        },
      };
    }

    const plans = plansData.plans;
    const totalNodes = plans.reduce((sum, p) => sum + p.node_count, 0);
    const completedNodes = plans.reduce((sum, p) => sum + p.completed_nodes, 0);
    const overallMastery = plans.length > 0
      ? plans.reduce((sum, p) => sum + p.mastery, 0) / plans.length
      : 0;

    // Estimate status distribution (since we don't have per-node data here)
    // This is an approximation based on mastery levels
    const statusDistribution = plans.reduce(
      (acc, p) => {
        const inProgressCount = Math.max(0, p.node_count - p.completed_nodes - Math.floor(p.node_count * (1 - p.mastery)));
        acc.mastered += p.completed_nodes;
        acc.inProgress += Math.min(3, inProgressCount); // Cap at 3 in-progress nodes
        acc.available += Math.max(0, Math.floor((p.node_count - p.completed_nodes) * p.mastery));
        acc.locked += Math.max(0, p.node_count - p.completed_nodes - acc.available - acc.inProgress);
        return acc;
      },
      { locked: 0, available: 0, inProgress: 0, mastered: 0 }
    );

    return {
      totalNodes,
      completedNodes,
      overallMastery,
      totalPlans: plans.length,
      statusDistribution,
    };
  }, [plansData]);

  // Mock timeline data (would need historical API endpoint)
  const timelineData = useMemo(() => {
    // Generate last 7 days of mock data
    const data = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        mastery: Math.max(0, (stats.overallMastery * 100) - (i * 2) + Math.random() * 5),
        nodesCompleted: Math.max(0, stats.completedNodes - i * Math.floor(stats.completedNodes / 10)),
      });
    }
    return data;
  }, [stats]);

  // Mock exercise stats (would need historical API endpoint)
  const exerciseStats = useMemo(() => {
    return {
      mcq: { attempted: 45, correct: 38 },
      shortAnswer: { attempted: 20, correct: 15 },
      fillBlank: { attempted: 30, correct: 24 },
      coding: { attempted: 12, correct: 8 },
      flashcard: { attempted: 25, correct: 22 },
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-parchment">
        <div className="container mx-auto px-4 py-8">
          <LoadingSkeleton />
          <p className="text-center text-ink/60 mt-4">Loading your progress...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-parchment">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-terracotta mb-4">Failed to load progress data</p>
            <p className="text-ink/60 text-sm">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ink mb-2">
            Your Progress
          </h1>
          <p className="text-ink/60">
            {user?.name
              ? `Track your learning journey, ${user.name.split(' ')[0]}`
              : 'Track your learning journey'}
          </p>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Overall Mastery"
            value={`${Math.round(stats.overallMastery * 100)}%`}
            icon={<TrendingUp className="w-5 h-5" />}
            color="gold"
          />
          <StatCard
            label="Nodes Completed"
            value={stats.completedNodes}
            subtext={`of ${stats.totalNodes}`}
            icon={<Target className="w-5 h-5" />}
            color="forest"
          />
          <StatCard
            label="Active Roadmaps"
            value={stats.totalPlans}
            icon={<BookOpen className="w-5 h-5" />}
            color="ocean"
          />
          <StatCard
            label="Mastery Rate"
            value={stats.totalNodes > 0
              ? `${Math.round((stats.completedNodes / stats.totalNodes) * 100)}%`
              : '0%'}
            icon={<Trophy className="w-5 h-5" />}
            color="terracotta"
          />
        </div>

        {/* Charts grid */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <MasteryOverviewChart data={stats.statusDistribution} />
          <ProgressTimelineChart data={timelineData} />
        </div>

        {/* Exercise stats */}
        <div className="mb-8">
          <ExerciseStatsChart data={exerciseStats} />
        </div>

        {/* Plan progress list */}
        {plansData && plansData.plans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Roadmap Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {plansData.plans
                .sort((a, b) => new Date(b.last_accessed_at).getTime() - new Date(a.last_accessed_at).getTime())
                .slice(0, 5)
                .map((plan) => (
                  <PlanProgressCard key={plan.plan_id} plan={plan} />
                ))}
            </CardContent>
          </Card>
        )}

        {/* Note about mock data */}
        <p className="text-xs text-center text-ink/40 mt-8">
          Note: Some analytics require historical data endpoints that are not yet implemented.
          Charts show estimated/mock data for demonstration.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  color: 'gold' | 'forest' | 'ocean' | 'terracotta';
}) {
  const colorClasses = {
    gold: 'bg-gold/10 text-gold',
    forest: 'bg-forest/10 text-forest',
    ocean: 'bg-ocean/10 text-ocean',
    terracotta: 'bg-terracotta/10 text-terracotta',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            {icon}
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-heading text-2xl font-bold text-ink">{value}</span>
              {subtext && <span className="text-xs text-ink/50">{subtext}</span>}
            </div>
            <p className="text-xs text-ink/60">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
