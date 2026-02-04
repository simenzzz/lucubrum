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

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(zoomLevel * delta);
    },
    [zoomLevel, setZoom]
  );

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
        <div className="animate-pulse text-ink/50">Loading roadmap...</div>
      </div>
    );
  }

  const centerX = containerSize.width / 2;
  const centerY = containerSize.height / 2;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-parchment cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Grid background pattern */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="#C4A052"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
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
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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
      <div className="absolute bottom-4 left-4 z-10 p-3 rounded-lg bg-parchment/90 backdrop-blur-sm border border-gold/30 shadow-md">
        <div className="text-xs font-medium text-ink/70 mb-2">Legend</div>
        <div className="space-y-1.5">
          <LegendItem color="locked" label="Locked" />
          <LegendItem color="gold" label="Available" />
          <LegendItem color="ocean" label="In Progress" />
          <LegendItem color="forest" label="Mastered" />
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const colorClasses: Record<string, string> = {
    locked: 'bg-locked/40 border-locked/60',
    gold: 'bg-gold/40 border-gold',
    ocean: 'bg-ocean/40 border-ocean',
    forest: 'bg-forest/40 border-forest',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded border ${colorClasses[color]}`} />
      <span className="text-xs text-ink/60">{label}</span>
    </div>
  );
}
