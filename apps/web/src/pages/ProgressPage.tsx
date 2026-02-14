import { useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import { useUserPlans } from '@/hooks/usePlan';
import { useAuthStore } from '@/stores/authStore';
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
        totalPlans: 0,
      };
    }

    const plans = plansData.plans;
    return {
      totalPlans: plans.length,
    };
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

        {/* Key stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <StatCard
            label="Active Roadmaps"
            value={stats.totalPlans}
            icon={<BookOpen className="w-5 h-5" />}
            color="amber"
          />
        </div>

        {/* Plan progress list */}
        {plansData && plansData.plans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Roadmaps</CardTitle>
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
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'amber' | 'sage' | 'lavender' | 'rose';
}) {
  const colorClasses = {
    amber: 'bg-amber/10 text-amber',
    sage: 'bg-sage/10 text-sage',
    lavender: 'bg-lavender/10 text-lavender',
    rose: 'bg-rose/10 text-rose',
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
              <span className="font-heading text-2xl font-bold text-warm-50">{value}</span>
            </div>
            <p className="text-xs text-warm-400">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
