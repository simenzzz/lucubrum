import { motion } from 'framer-motion';
import type { LayoutEdge } from '@/lib/dagLayout';
import type { NodeStatus } from './GraphNode';

interface GraphEdgeProps {
  edge: LayoutEdge;
  fromStatus: NodeStatus;
  toStatus: NodeStatus;
}

/**
 * Generate SVG path data for an edge.
 * If bendPoints exist, creates a smooth curve through all points.
 * Otherwise, uses a simple Bezier curve (backward compatible).
 */
function generatePathD(
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  bendPoints?: { x: number; y: number }[]
): string {
  if (!bendPoints || bendPoints.length === 0) {
    // Simple Bezier for single-layer edges
    const controlOffset = Math.abs(toPos.y - fromPos.y) * 0.4;
    return `
      M ${fromPos.x} ${fromPos.y}
      C ${fromPos.x} ${fromPos.y + controlOffset},
        ${toPos.x} ${toPos.y - controlOffset},
        ${toPos.x} ${toPos.y}
    `;
  }

  // Multi-layer edge with bend points
  // Generate smooth Catmull-Rom spline converted to cubic Bezier segments
  const allPoints = [fromPos, ...bendPoints, toPos];
  return catmullRomToBezier(allPoints);
}

/**
 * Convert Catmull-Rom spline to SVG cubic Bezier path.
 * Catmull-Rom gives smooth curves through all points.
 */
function catmullRomToBezier(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    const p0 = points[0];
    const p1 = points[1];
    return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
  }

  // Build path with Catmull-Rom segments converted to Bezier
  // Divisor 10 (vs standard 6) gives 60% tighter curves to prevent overshoot
  const TANGENT_FACTOR = 10;
  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1 = {
      x: p1.x + (p2.x - p0.x) / TANGENT_FACTOR,
      y: p1.y + (p2.y - p0.y) / TANGENT_FACTOR,
    };
    const cp2 = {
      x: p2.x - (p3.x - p1.x) / TANGENT_FACTOR,
      y: p2.y - (p3.y - p1.y) / TANGENT_FACTOR,
    };

    d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

export function GraphEdge({ edge, fromStatus, toStatus }: GraphEdgeProps) {
  const { fromPos, toPos, bendPoints } = edge;

  const pathD = generatePathD(fromPos, toPos, bendPoints);

  // Determine edge style based on node statuses
  const isActive = fromStatus === 'mastered' && toStatus !== 'locked';
  const isCompleted = fromStatus === 'mastered' && toStatus === 'mastered';
  const isLocked = toStatus === 'locked';

  const getStrokeColor = () => {
    if (isCompleted) return '#8BA888'; // sage
    if (isActive) return '#D4A55A'; // amber
    if (isLocked) return '#5C5349'; // locked
    return '#A68B6B'; // clay
  };

  const getStrokeOpacity = () => {
    if (isLocked) return 0.4;
    if (isActive || isCompleted) return 0.8;
    return 0.5;
  };

  return (
    <g>
      {/* Edge path */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={getStrokeColor()}
        strokeWidth={isActive || isCompleted ? 2.5 : 2}
        strokeOpacity={getStrokeOpacity()}
        strokeLinecap="round"
        strokeDasharray={isLocked ? '6 4' : undefined}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />

      {/* Arrow head */}
      <motion.polygon
        points={`
          ${toPos.x},${toPos.y}
          ${toPos.x - 6},${toPos.y - 10}
          ${toPos.x + 6},${toPos.y - 10}
        `}
        fill={getStrokeColor()}
        fillOpacity={getStrokeOpacity()}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.4, duration: 0.2 }}
      />

      {/* Glow effect for active edges */}
      {isActive && !isCompleted && (
        <motion.path
          d={pathD}
          fill="none"
          stroke="#D4A55A"
          strokeWidth={6}
          strokeOpacity={0.1}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}
    </g>
  );
}
