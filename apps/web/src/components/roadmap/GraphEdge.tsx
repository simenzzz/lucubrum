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
    if (isCompleted) return '#4A6741'; // forest
    if (isActive) return '#C4A052'; // gold
    if (isLocked) return '#8B8680'; // locked
    return '#B8956A'; // gold-muted
  };

  const getStrokeOpacity = () => {
    if (isLocked) return 0.3;
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
          stroke="#C4A052"
          strokeWidth={6}
          strokeOpacity={0.15}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}
    </g>
  );
}
