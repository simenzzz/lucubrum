import type { PlanNode } from '@/types/api.types';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  layer: number;
  node: PlanNode;
}

export interface LayoutEdge {
  from: string;
  to: string;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  horizontalSpacing?: number;
  verticalSpacing?: number;
  padding?: number;
  jitter?: number; // Random offset for organic feel
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  nodeWidth: 200,
  nodeHeight: 80,
  horizontalSpacing: 80,
  verticalSpacing: 120,
  padding: 60,
  jitter: 15,
};

/**
 * Compute DAG layout using topological sort and layer assignment.
 * Places nodes in layers based on their prerequisites (dependencies).
 */
export function computeDagLayout(
  nodes: PlanNode[],
  options: LayoutOptions = {}
): LayoutResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  // Build adjacency list (node -> nodes that depend on it)
  const nodeMap = new Map<string, PlanNode>(nodes.map((n) => [n.node_id, n]));
  const dependents = new Map<string, string[]>();
  const dependencies = new Map<string, string[]>();

  for (const node of nodes) {
    dependents.set(node.node_id, []);
    dependencies.set(node.node_id, node.prerequisites.filter((p) => nodeMap.has(p)));
  }

  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (dependents.has(prereq)) {
        dependents.get(prereq)!.push(node.node_id);
      }
    }
  }

  // Assign layers using longest path algorithm
  const layers = assignLayers(nodes, dependencies);

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const [nodeId, layer] of layers.entries()) {
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(nodeId);
  }

  // Position nodes within layers
  const maxLayer = Math.max(...layers.values(), 0);
  const layoutNodes: LayoutNode[] = [];
  let maxWidth = 0;

  // Seeded random for deterministic jitter based on node id
  const seededRandom = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return ((hash % 1000) / 1000) * 2 - 1; // Range: -1 to 1
  };

  for (let layer = 0; layer <= maxLayer; layer++) {
    const nodesInLayer = layerGroups.get(layer) || [];
    const layerWidth =
      nodesInLayer.length * opts.nodeWidth +
      (nodesInLayer.length - 1) * opts.horizontalSpacing;
    maxWidth = Math.max(maxWidth, layerWidth);

    const startX = -layerWidth / 2 + opts.nodeWidth / 2;
    const y = layer * (opts.nodeHeight + opts.verticalSpacing);

    nodesInLayer.forEach((nodeId, index) => {
      const baseX = startX + index * (opts.nodeWidth + opts.horizontalSpacing);
      const jitterX = seededRandom(nodeId + 'x') * opts.jitter;
      const jitterY = seededRandom(nodeId + 'y') * opts.jitter;

      layoutNodes.push({
        id: nodeId,
        x: baseX + jitterX,
        y: y + jitterY,
        layer,
        node: nodeMap.get(nodeId)!,
      });
    });
  }

  // Create position lookup for edge calculation
  const positionMap = new Map<string, { x: number; y: number }>();
  for (const ln of layoutNodes) {
    positionMap.set(ln.id, { x: ln.x, y: ln.y });
  }

  // Generate edges
  const layoutEdges: LayoutEdge[] = [];
  for (const node of nodes) {
    const toPos = positionMap.get(node.node_id);
    if (!toPos) continue;

    for (const prereq of node.prerequisites) {
      const fromPos = positionMap.get(prereq);
      if (!fromPos) continue;

      layoutEdges.push({
        from: prereq,
        to: node.node_id,
        fromPos: { x: fromPos.x, y: fromPos.y + opts.nodeHeight / 2 },
        toPos: { x: toPos.x, y: toPos.y - opts.nodeHeight / 2 },
      });
    }
  }

  const totalHeight =
    (maxLayer + 1) * opts.nodeHeight +
    maxLayer * opts.verticalSpacing +
    opts.padding * 2;

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: maxWidth + opts.padding * 2,
    height: totalHeight,
  };
}

/**
 * Assign layers using longest path from sources.
 * Nodes with no prerequisites start at layer 0.
 */
function assignLayers(
  nodes: PlanNode[],
  dependencies: Map<string, string[]>
): Map<string, number> {
  const layers = new Map<string, number>();
  const visited = new Set<string>();

  // Find all node IDs that exist
  const nodeIds = new Set(nodes.map((n) => n.node_id));

  // DFS to compute longest path to each node
  function computeLayer(nodeId: string): number {
    if (layers.has(nodeId)) {
      return layers.get(nodeId)!;
    }

    if (visited.has(nodeId)) {
      // Cycle detected, treat as layer 0
      return 0;
    }

    visited.add(nodeId);

    const deps = dependencies.get(nodeId) || [];
    const validDeps = deps.filter((d) => nodeIds.has(d));

    if (validDeps.length === 0) {
      layers.set(nodeId, 0);
      return 0;
    }

    const maxDepLayer = Math.max(...validDeps.map(computeLayer));
    const layer = maxDepLayer + 1;
    layers.set(nodeId, layer);
    return layer;
  }

  for (const node of nodes) {
    computeLayer(node.node_id);
  }

  return layers;
}

/**
 * Center the layout around origin (0, 0).
 */
export function centerLayout(layout: LayoutResult): LayoutResult {
  if (layout.nodes.length === 0) return layout;

  const minX = Math.min(...layout.nodes.map((n) => n.x));
  const maxX = Math.max(...layout.nodes.map((n) => n.x));
  const minY = Math.min(...layout.nodes.map((n) => n.y));
  const maxY = Math.max(...layout.nodes.map((n) => n.y));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    ...layout,
    nodes: layout.nodes.map((n) => ({
      ...n,
      x: n.x - centerX,
      y: n.y - centerY,
    })),
    edges: layout.edges.map((e) => ({
      ...e,
      fromPos: { x: e.fromPos.x - centerX, y: e.fromPos.y - centerY },
      toPos: { x: e.toPos.x - centerX, y: e.toPos.y - centerY },
    })),
  };
}

/**
 * Compute optimal initial zoom to fit all nodes in viewport.
 */
export function computeFitZoom(
  layout: LayoutResult,
  viewportWidth: number,
  viewportHeight: number,
  nodeWidth: number = DEFAULT_OPTIONS.nodeWidth,
  nodeHeight: number = DEFAULT_OPTIONS.nodeHeight,
  padding: number = 100
): number {
  if (layout.nodes.length === 0) return 1;

  const contentWidth = layout.width + nodeWidth;
  const contentHeight = layout.height + nodeHeight;

  const scaleX = (viewportWidth - padding * 2) / contentWidth;
  const scaleY = (viewportHeight - padding * 2) / contentHeight;

  // Use the smaller scale and clamp between 0.25 and 1.5
  return Math.min(Math.max(Math.min(scaleX, scaleY), 0.25), 1.5);
}
