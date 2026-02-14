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

type SortOption = 'recent' | 'name';

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
        case 'name':
          return a.topic.localeCompare(b.topic);
        case 'recent':
        default:
          return new Date(b.last_accessed_at).getTime() - new Date(a.last_accessed_at).getTime();
      }
    }) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-hearth-900">
        <div className="container mx-auto px-4 py-8">
          <LoadingSkeleton />
          <p className="text-center text-warm-400 mt-4">Loading your roadmaps...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-hearth-900">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-rose mb-4">Failed to load your roadmaps</p>
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

            {/* Stats summary */}
            <div className="mb-8">
              <div className="p-4 rounded-xl bg-hearth-800 border border-border-moderate">
                <div className="flex items-center gap-3">
                  <span className="text-amber/70"><Map className="w-5 h-5" /></span>
                  <span className="font-heading text-2xl font-bold text-warm-50">{data?.total ?? 0}</span>
                </div>
                <span className="text-xs text-warm-400">Total Roadmaps</span>
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
