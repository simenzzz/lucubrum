import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Map, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useUserPlans } from '@/hooks/usePlan';
import { useAuthStore } from '@/stores/authStore';
import { LogbookCard } from '@/components/roadmaps/LogbookCard';
import { EmptyLogbook } from '@/components/roadmaps/EmptyLogbook';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SortOption = 'recent' | 'progress' | 'name';

export function MyRoadmapsPage() {
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  const { data, isLoading, error } = useUserPlans();

  // Filter and sort plans
  const filteredPlans = data?.plans
    .filter((plan) =>
      plan.topic.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'progress':
          return b.mastery - a.mastery;
        case 'name':
          return a.topic.localeCompare(b.topic);
        case 'recent':
        default:
          return new Date(b.last_accessed_at).getTime() - new Date(a.last_accessed_at).getTime();
      }
    }) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-parchment">
        <div className="container mx-auto px-4 py-8">
          <LoadingSkeleton />
          <p className="text-center text-ink/60 mt-4">Loading your roadmaps...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-parchment">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-terracotta mb-4">Failed to load your roadmaps</p>
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center">
              <Map className="w-6 h-6 text-gold" />
            </div>
            <div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ink">
                My Roadmaps
              </h1>
              <p className="text-sm text-ink/60">
                {user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Your learning journeys'}
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
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40" />
                <Input
                  type="text"
                  placeholder="Search roadmaps..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-ink/40" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Most Recent</SelectItem>
                    <SelectItem value="progress">Highest Progress</SelectItem>
                    <SelectItem value="name">Alphabetical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stats summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Total Roadmaps"
                value={data?.total ?? 0}
                icon={<Map className="w-5 h-5" />}
              />
              <StatCard
                label="Nodes Completed"
                value={data?.plans.reduce((sum, p) => sum + p.completed_nodes, 0) ?? 0}
                icon={<span className="text-lg">✓</span>}
              />
              <StatCard
                label="In Progress"
                value={data?.plans.filter((p) => p.mastery > 0 && p.mastery < 1).length ?? 0}
                icon={<span className="text-lg">⏳</span>}
              />
              <StatCard
                label="Mastered"
                value={data?.plans.filter((p) => p.mastery >= 0.9).length ?? 0}
                icon={<span className="text-lg">🏆</span>}
              />
            </div>

            {/* Roadmap grid */}
            {filteredPlans.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-ink/60">No roadmaps match your search.</p>
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

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-lg bg-parchment-dark/50 border border-gold/20">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gold/70">{icon}</span>
        <span className="font-heading text-2xl font-bold text-ink">{value}</span>
      </div>
      <span className="text-xs text-ink/50">{label}</span>
    </div>
  );
}
