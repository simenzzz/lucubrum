import { motion } from 'framer-motion';
import type { LayoutEdge } from '@/lib/dagLayout';
import type { NodeStatus } from './GraphNode';

interface GraphEdgeProps {
  edge: LayoutEdge;
  fromStatus: NodeStatus;
  toStatus: NodeStatus;
}

export function GraphEdge({ edge, fromStatus, toStatus }: GraphEdgeProps) {
  const { fromPos, toPos } = edge;

  // Calculate control points for a smooth bezier curve
  const controlOffset = Math.abs(toPos.y - fromPos.y) * 0.4;

  const pathD = `
    M ${fromPos.x} ${fromPos.y}
    C ${fromPos.x} ${fromPos.y + controlOffset},
      ${toPos.x} ${toPos.y - controlOffset},
      ${toPos.x} ${toPos.y}
  `;

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
