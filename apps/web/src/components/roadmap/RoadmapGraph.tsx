import { useRef, useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { useRoadmapStore } from '@/stores/roadmapStore';
import { computeDagLayout, centerLayout, computeFitZoom, type LayoutResult } from '@/lib/dagLayout';
import { GraphNode, type NodeStatus } from './GraphNode';
import { GraphEdge } from './GraphEdge';
import { RoadmapControls } from './RoadmapControls';
import type { PlanNode } from '@/types/api.types';

interface NodeMasteryInfo {
  node_id: string;
  mastery: number;
  status: NodeStatus;
  hasExamAttempt: boolean;
}

interface RoadmapGraphProps {
  nodes: PlanNode[];
  masteryData: NodeMasteryInfo[];
  onNodeSelect: (node: PlanNode) => void;
}

export function RoadmapGraph({ nodes, masteryData, onNodeSelect }: RoadmapGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const {
    selectedNodeId,
    zoomLevel,
    panOffset,
    setZoom,
    setPan,
    resetView,
  } = useRoadmapStore();

  // Build mastery lookup
  const masteryMap = new Map(masteryData.map((m) => [m.node_id, m]));

  // Compute layout when nodes change
  useEffect(() => {
    if (nodes.length === 0) return;

    const rawLayout = computeDagLayout(nodes);
    const centeredLayout = centerLayout(rawLayout);
    setLayout(centeredLayout);
  }, [nodes]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Fit to screen on initial load
  useEffect(() => {
    if (layout && containerSize.width > 0 && containerSize.height > 0) {
      const fitZoom = computeFitZoom(layout, containerSize.width, containerSize.height);
      setZoom(fitZoom);
    }
  }, [layout, containerSize, setZoom]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom(zoomLevel * 1.2);
  }, [zoomLevel, setZoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(zoomLevel / 1.2);
  }, [zoomLevel, setZoom]);

  const handleFit = useCallback(() => {
    if (layout && containerSize.width > 0) {
      const fitZoom = computeFitZoom(layout, containerSize.width, containerSize.height);
      setZoom(fitZoom);
      setPan({ x: 0, y: 0 });
    }
  }, [layout, containerSize, setZoom, setPan]);

  const handleReset = useCallback(() => {
    resetView();
    if (layout && containerSize.width > 0) {
      const fitZoom = computeFitZoom(layout, containerSize.width, containerSize.height);
      setZoom(fitZoom);
    }
  }, [resetView, layout, containerSize, setZoom]);

  // Mouse wheel zoom. Use a native non-passive listener so Chrome allows preventDefault.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(useRoadmapStore.getState().zoomLevel * delta);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [layout, setZoom]);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    },
    [panOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart, setPan]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handlers for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [initialZoom, setInitialZoom] = useState<number>(1);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1) {
        // Pan
        setTouchStart({
          x: e.touches[0].clientX - panOffset.x,
          y: e.touches[0].clientY - panOffset.y,
        });
      } else if (e.touches.length === 2) {
        // Pinch zoom
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        setInitialPinchDistance(dist);
        setInitialZoom(zoomLevel);
      }
    },
    [panOffset, zoomLevel]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 1 && touchStart) {
        // Pan
        setPan({
          x: e.touches[0].clientX - touchStart.x,
          y: e.touches[0].clientY - touchStart.y,
        });
      } else if (e.touches.length === 2 && initialPinchDistance !== null) {
        // Pinch zoom
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        const scale = dist / initialPinchDistance;
        setZoom(initialZoom * scale);
      }
    },
    [touchStart, initialPinchDistance, initialZoom, setPan, setZoom]
  );

  const handleTouchEnd = useCallback(() => {
    setTouchStart(null);
    setInitialPinchDistance(null);
  }, []);

  if (!layout) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-warm-400">Loading roadmap...</div>
      </div>
    );
  }

  const centerX = containerSize.width / 2;
  const centerY = containerSize.height / 2;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-hearth-900 cursor-grab active:cursor-grabbing touch-none overscroll-contain"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dot grid background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="1" fill="#D4A55A" opacity="0.04" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Transformed content */}
      <motion.div
        className="absolute"
        style={{
          left: centerX + panOffset.x,
          top: centerY + panOffset.y,
          transform: `scale(${zoomLevel})`,
          transformOrigin: 'center center',
        }}
        animate={{ scale: zoomLevel }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      >
        {/* Edges SVG layer */}
        <svg
          className="absolute pointer-events-none"
          style={{
            left: -layout.width / 2 - 100,
            top: -layout.height / 2 - 100,
            width: layout.width + 200,
            height: layout.height + 200,
          }}
          viewBox={`${-layout.width / 2 - 100} ${-layout.height / 2 - 100} ${layout.width + 200} ${layout.height + 200}`}
        >
          {layout.edges.map((edge) => {
            const fromMastery = masteryMap.get(edge.from);
            const toMastery = masteryMap.get(edge.to);
            return (
              <GraphEdge
                key={`${edge.from}-${edge.to}`}
                edge={edge}
                fromStatus={fromMastery?.status || 'locked'}
                toStatus={toMastery?.status || 'locked'}
              />
            );
          })}
        </svg>

        {/* Nodes layer */}
        {layout.nodes.map((layoutNode) => {
          const masteryInfo = masteryMap.get(layoutNode.id);
          return (
            <GraphNode
              key={layoutNode.id}
              layoutNode={layoutNode}
              status={masteryInfo?.status || 'locked'}
              mastery={masteryInfo?.mastery || 0}
              isSelected={selectedNodeId === layoutNode.id}
              onClick={() => onNodeSelect(layoutNode.node)}
              hasExamAttempt={masteryInfo?.hasExamAttempt || false}
            />
          );
        })}
      </motion.div>

      {/* Controls */}
      <RoadmapControls
        zoom={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFit={handleFit}
        onReset={handleReset}
        className="absolute bottom-4 right-4 z-10"
      />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 glass-panel p-3">
        <div className="text-xs font-medium text-warm-400 mb-2">Legend</div>
        <div className="space-y-1.5">
          <LegendItem color="locked" label="Locked" />
          <LegendItem color="amber" label="Available" />
          <LegendItem color="lavender" label="In Progress" />
          <LegendItem color="sage" label="Mastered" />
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const colorClasses: Record<string, string> = {
    locked: 'bg-locked/40 border-locked/60',
    amber: 'bg-amber/30 border-amber',
    lavender: 'bg-lavender/30 border-lavender',
    sage: 'bg-sage/30 border-sage',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full border ${colorClasses[color]}`} />
      <span className="text-xs text-warm-200">{label}</span>
    </div>
  );
}
