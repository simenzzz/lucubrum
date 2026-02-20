import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { usePlan, usePlanMastery, useNodeResourceStatuses } from '@/hooks/usePlan';
import { useRoadmapStore } from '@/stores/roadmapStore';
import { RoadmapGraph } from '@/components/roadmap/RoadmapGraph';
import { NodePopup } from '@/components/roadmap/NodePopup';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getSafeErrorMessage } from '@/lib/utils';
import { MASTERY_THRESHOLD, PREREQ_THRESHOLD } from '@/constants/mastery';
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

  // Fetch resource status for all nodes
  const {
    data: resourceStatuses,
  } = useNodeResourceStatuses(planId || '');

  // All hooks must be called before any conditional returns (React rules of hooks)
  const masteredCount = useMemo(() => {
    if (!mastery?.mastery_by_node) return 0;
    return Object.values(mastery.mastery_by_node).filter(
      m => m && m.score >= MASTERY_THRESHOLD
    ).length;
  }, [mastery]);

  const totalNodes = plan?.nodes.length ?? 0;
  const masteredPercent = totalNodes > 0 ? Math.round((masteredCount / totalNodes) * 100) : 0;

  const masteryData = useMemo(() => {
    if (!plan) return [];
    return plan.nodes.map((n) => {
      const nodeMastery = mastery?.mastery_by_node?.[n.node_id];
      const score = nodeMastery?.score ?? 0;

      const prereqsMet = n.prerequisites.every((prereqId) => {
        const prereqMastery = mastery?.mastery_by_node?.[prereqId];
        return (prereqMastery?.score ?? 0) >= PREREQ_THRESHOLD;
      });

      let status: 'locked' | 'available' | 'in_progress' | 'mastered';
      if (score >= MASTERY_THRESHOLD) status = 'mastered';
      else if (score > 0) status = 'in_progress';
      else if (n.prerequisites.length === 0 || prereqsMet) status = 'available';
      else status = 'locked';

      return {
        node_id: n.node_id,
        mastery: score,
        status,
        hasExamAttempt: nodeMastery?.has_exam_attempt ?? false,
      };
    });
  }, [plan, mastery]);

  const completedNodes = useMemo(
    () => masteryData.filter(m => m.status === 'mastered').length,
    [masteryData]
  );

  if (!planId) {
    return (
      <div className="min-h-screen bg-hearth-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-rose mx-auto mb-4" />
          <h1 className="font-heading text-2xl text-warm-50 mb-2">Invalid Plan</h1>
          <p className="text-warm-400 mb-4">No plan ID was provided.</p>
          <Link to="/">
            <Button variant="primary">Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (planLoading || masteryLoading) {
    return (
      <div className="min-h-screen bg-hearth-900">
        <div className="container mx-auto px-4 py-8">
          <LoadingSkeleton />
          <p className="text-center text-warm-400 mt-4">Loading your learning roadmap...</p>
        </div>
      </div>
    );
  }

  if (planError || !plan) {
    return (
      <div className="min-h-screen bg-hearth-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-rose mx-auto mb-4" />
          <h1 className="font-heading text-2xl text-warm-50 mb-2">Failed to Load Plan</h1>
          <p className="text-warm-400 mb-4">
            {getSafeErrorMessage(planError, 'Failed to load your learning roadmap.')}
          </p>
          <Link to="/">
            <Button variant="primary">Return Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleNodeSelect = (node: PlanNode) => {
    selectNode(node);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-hearth-900">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border-subtle bg-hearth-800/95 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-4">
            <Link to="/my-roadmaps" className="text-warm-400 hover:text-warm-50 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-heading text-xl font-semibold text-warm-50">{plan.topic}</h1>
              <p className="text-sm text-warm-400">
                {completedNodes > 0
                  ? `${completedNodes}/${plan.nodes.length} nodes completed`
                  : `${plan.nodes.length} nodes`}
              </p>
            </div>
          </div>

          {mastery && (
            <div className="hidden sm:flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-warm-400">Nodes Mastered</div>
                <div className="font-heading text-lg font-semibold text-amber">
                  {masteredCount} / {totalNodes}
                </div>
              </div>
              <div className="w-48 flex flex-col gap-1">
                <Progress
                  value={masteredPercent}
                  max={100}
                  className="h-3"
                />
                <span className="text-xs text-warm-400 text-right">
                  {masteredPercent}%
                </span>
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

      {/* Node Side Panel */}
      {selectedNode && (
        <NodePopup
          node={selectedNode}
          planId={planId}
          isOpen={isNodePopupOpen}
          onClose={closeNodePopup}
          mastery={masteryData.find((m) => m.node_id === selectedNode.node_id)?.mastery || 0}
          nodeStatus={resourceStatuses?.[selectedNode.node_id]}
        />
      )}
    </div>
  );
}
