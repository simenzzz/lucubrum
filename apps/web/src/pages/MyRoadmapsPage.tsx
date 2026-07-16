/**
 * My Roadmaps — the single "your plans" page: progress stats, a
 * continue-learning hero, and the searchable/sortable roadmap grid.
 * (Absorbed the former /progress page; that route now redirects here.)
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Map,
  Plus,
  Search,
  SlidersHorizontal,
  ArrowRight,
  BookOpen,
  Flame,
  AlertCircle,
} from 'lucide-react';
import { useUserPlans, useNextNode } from '@/hooks/usePlan';
import { useAuthStore } from '@/stores/authStore';
import { LogbookCard } from '@/components/roadmaps/LogbookCard';
import { EmptyLogbook } from '@/components/roadmaps/EmptyLogbook';
import { PageLoading } from '@/components/layout/LoadingSkeleton';
import { CenteredState } from '@/components/layout/CenteredState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, timeAgo, getSafeErrorMessage, LEVEL_BADGES } from '@/lib/utils';
import type { UserPlanSummary } from '@/types/api.types';

type SortOption = 'recent' | 'name';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export function MyRoadmapsPage() {
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  const { data, isLoading, error } = useUserPlans();

  // Progress stats + most-recent plan for the continue-learning hero
  const stats = useMemo(() => {
    const plans = data?.plans ?? [];
    const now = Date.now();
    let studiedToday = 0;
    let needsAttention = 0;
    let heroPlan: UserPlanSummary | null = null;

    for (const plan of plans) {
      const accessedAt = new Date(plan.last_accessed_at).getTime();
      if (now - accessedAt < ONE_DAY_MS) studiedToday++;
      if (now - accessedAt > SEVEN_DAYS_MS) needsAttention++;
      if (!heroPlan || accessedAt > new Date(heroPlan.last_accessed_at).getTime()) {
        heroPlan = plan;
      }
    }

    return { total: plans.length, studiedToday, needsAttention, heroPlan };
  }, [data]);

  // Filter and sort plans
  const filteredPlans = data?.plans
    .filter((plan) =>
      plan.topic.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.topic.localeCompare(b.topic);
        case 'recent':
        default:
          return new Date(b.last_accessed_at).getTime() - new Date(a.last_accessed_at).getTime();
      }
    }) || [];

  if (isLoading) {
    return <PageLoading message="Loading your roadmaps..." />;
  }

  if (error) {
    return (
      <CenteredState
        icon={AlertCircle}
        title="Failed to Load Roadmaps"
        message={getSafeErrorMessage(error, 'Failed to load your roadmaps.')}
        fullScreen
      >
        <Button variant="primary" asChild>
          <Link to="/">Return Home</Link>
        </Button>
      </CenteredState>
    );
  }

  return (
    <div className="min-h-screen bg-hearth-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber/20 flex items-center justify-center">
              <Map className="w-6 h-6 text-amber" />
            </div>
            <div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-warm-50">
                My Roadmaps
              </h1>
              <p className="text-sm text-warm-400">
                {user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Your learning paths'}
              </p>
            </div>
          </div>

          <Link to="/">
            <Button variant="primary">
              <Plus className="w-4 h-4 mr-2" />
              New Roadmap
            </Button>
          </Link>
        </div>

        {/* Show empty state or content */}
        {data?.plans.length === 0 ? (
          <EmptyLogbook />
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              <StatCard label="Total" value={stats.total} icon={<BookOpen className="w-4 h-4" />} />
              <StatCard
                label="Studied Today"
                value={stats.studiedToday}
                icon={<Flame className="w-4 h-4" />}
                color="amber"
              />
              <StatCard
                label="Needs Attention"
                value={stats.needsAttention}
                icon={<AlertCircle className="w-4 h-4" />}
                color="rose"
              />
            </div>

            {/* Continue Learning hero (hidden while searching) */}
            {stats.heroPlan && !searchQuery && <HeroCard plan={stats.heroPlan} />}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
                <Input
                  type="text"
                  placeholder="Search roadmaps..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-warm-400" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Most Recent</SelectItem>
                    <SelectItem value="name">Alphabetical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Roadmap grid */}
            {filteredPlans.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-warm-400">No roadmaps match your search.</p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPlans.map((plan, index) => (
                  <LogbookCard key={plan.plan_id} plan={plan} index={index} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** "Continue Learning" banner for the most recently accessed plan */
function HeroCard({ plan }: { plan: UserPlanSummary }) {
  const { data: next, isError } = useNextNode(plan.plan_id);
  const levelBadge =
    LEVEL_BADGES[plan.user_level as keyof typeof LEVEL_BADGES] ?? LEVEL_BADGES.beginner;

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
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
              levelBadge.bgColor,
              levelBadge.color
            )}>
              {levelBadge.label}
            </span>
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
            <span className="font-heading text-xl font-bold text-warm-50">{value}</span>
            <p className="text-xs text-warm-500 uppercase tracking-wide">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
