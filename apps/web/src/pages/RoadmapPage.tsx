import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, AlertCircle } from 'lucide-react';
import { usePlan, usePlanMastery, usePlanResources } from '@/hooks/usePlan';
import { useRoadmapStore } from '@/stores/roadmapStore';
import { RoadmapGraph } from '@/components/roadmap/RoadmapGraph';
import { NodePopup } from '@/components/roadmap/NodePopup';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { Button } from '@/components/ui/button';
import { getSafeErrorMessage } from '@/lib/utils';
import type { PlanNode } from '@/types/api.types';

export function RoadmapPage() {
  const { planId } = useParams<{ planId: string }>();
  const { selectNode, selectedNode, isNodePopupOpen, closeNodePopup } = useRoadmapStore();

  // Fetch plan data
  const {
    data: plan,
    isLoading: planLoading,
    error: planError,
  } = usePlan(planId || '');

  // Fetch mastery data
  const {
    data: mastery,
    isLoading: masteryLoading,
  } = usePlanMastery(planId || '');

  // Fetch resources (trigger if not already cached)
  const { data: resources } = usePlanResources(planId || '');

  if (!planId) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-terracotta mx-auto mb-4" />
          <h1 className="font-heading text-2xl text-ink mb-2">Invalid Plan</h1>
          <p className="text-ink/60 mb-4">No plan ID was provided.</p>
          <Link to="/">
            <Button variant="primary">Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (planLoading || masteryLoading) {
    return (
      <div className="min-h-screen bg-parchment">
        <div className="container mx-auto px-4 py-8">
          <LoadingSkeleton />
          <p className="text-center text-ink/60 mt-4">Loading your learning roadmap...</p>
        </div>
      </div>
    );
  }

  if (planError || !plan) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-terracotta mx-auto mb-4" />
          <h1 className="font-heading text-2xl text-ink mb-2">Failed to Load Plan</h1>
          <p className="text-ink/60 mb-4">
            {getSafeErrorMessage(planError, 'Failed to load your learning roadmap.')}
          </p>
          <Link to="/">
            <Button variant="primary">Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Transform mastery data for the graph
  const masteryData = mastery?.node_masteries.map((nm) => ({
    node_id: nm.node_id,
    mastery: nm.mastery,
    status: nm.status as 'locked' | 'available' | 'in_progress' | 'mastered',
  })) || plan.nodes.map((n) => ({
    node_id: n.node_id,
    mastery: 0,
    status: n.prerequisites.length === 0 ? 'available' as const : 'locked' as const,
  }));

  // Get resources for selected node
  const selectedNodeResources = selectedNode
    ? resources?.resources.find((r) => r.node_id === selectedNode.node_id)?.resources || []
    : [];

  const handleNodeSelect = (node: PlanNode) => {
    selectNode(node);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-parchment">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gold/20 bg-parchment/95 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-4">
            <Link to="/my-roadmaps" className="text-ink/60 hover:text-ink transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-heading text-xl font-semibold text-ink">{plan.topic}</h1>
              <p className="text-sm text-ink/60">
                {mastery
                  ? `${mastery.completed_nodes}/${mastery.total_nodes} nodes completed`
                  : `${plan.nodes.length} nodes`}
              </p>
            </div>
          </div>

          {mastery && (
            <div className="hidden sm:flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-ink/60">Overall Mastery</div>
                <div className="font-heading text-lg font-semibold text-gold">
                  {Math.round(mastery.overall_mastery * 100)}%
                </div>
              </div>
              <div className="w-20 h-20 relative">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-parchment-dark"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="none"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={226}
                    strokeDashoffset={226 - (mastery.overall_mastery * 226)}
                    className="text-gold transition-all duration-500"
                  />
                </svg>
                <BookOpen className="absolute inset-0 m-auto w-6 h-6 text-gold" />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Graph Area */}
      <main className="flex-1 relative overflow-hidden">
        <RoadmapGraph
          nodes={plan.nodes}
          masteryData={masteryData}
          onNodeSelect={handleNodeSelect}
        />
      </main>

      {/* Node Popup Modal */}
      {selectedNode && (
        <NodePopup
          node={selectedNode}
          planId={planId}
          isOpen={isNodePopupOpen}
          onClose={closeNodePopup}
          resources={selectedNodeResources}
          mastery={masteryData.find((m) => m.node_id === selectedNode.node_id)?.mastery || 0}
        />
      )}
    </div>
  );
}
