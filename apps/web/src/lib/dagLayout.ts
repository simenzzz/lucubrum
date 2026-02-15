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
  bendPoints?: { x: number; y: number }[];
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
  jitter?: number;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  nodeWidth: 220,    // matches w-[220px] in GraphNode
  nodeHeight: 100,   // matches ~100px rendered height
  horizontalSpacing: 80,
  verticalSpacing: 120,
  padding: 60,
  jitter: 15,
};

// Edge routing constants
const EDGE_PADDING = 60;
const LANE_SPACING = 40;

// Internal structures for layout computation
interface InternalNode {
  id: string;
  layer: number;
  isDummy: boolean;
  node?: PlanNode;
  order: number;
}

interface InternalEdge {
  from: string;
  to: string;
}

/**
 * Compute DAG layout using Sugiyama algorithm.
 * 1. Layer assignment (longest path)
 * 2. Dummy node insertion for long edges
 * 3. Cross-minimization (barycenter heuristic)
 * 4. Horizontal coordinate assignment
 * 5. Edge routing through dummy nodes
 */
export function computeDagLayout(
  nodes: PlanNode[],
  options: LayoutOptions = {}
): LayoutResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  // Build adjacency structures
  const nodeMap = new Map<string, PlanNode>(nodes.map((n) => [n.node_id, n]));
  const dependencies = new Map<string, string[]>();

  for (const node of nodes) {
    dependencies.set(node.node_id, node.prerequisites.filter((p) => nodeMap.has(p)));
  }

  // Step 1: Layer Assignment (keep existing - it's correct)
  const layers = assignLayers(nodes, dependencies);

  // Build initial internal nodes
  let internalNodes = new Map<string, InternalNode>();
  for (const node of nodes) {
    internalNodes.set(node.node_id, {
      id: node.node_id,
      layer: layers.get(node.node_id)!,
      isDummy: false,
      node: node,
      order: 0,
    });
  }

  // Build initial edge list
  let edges: InternalEdge[] = [];
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (nodeMap.has(prereq)) {
        edges.push({ from: prereq, to: node.node_id });
      }
    }
  }

  // Step 2: Insert Dummy Nodes for long edges
  const dummyResult = insertDummyNodes(internalNodes, edges, layers);
  internalNodes = dummyResult.nodes;
  edges = dummyResult.edges;
  const updatedLayers = dummyResult.layers;

  // Step 3: Cross Minimization (barycenter heuristic)
  minimizeCrossings(internalNodes, edges);

  // Build dummy chain lookup for interpolation positioning
  const outgoingAdj = new Map<string, string[]>();
  for (const [id] of internalNodes) {
    outgoingAdj.set(id, []);
  }
  for (const edge of edges) {
    outgoingAdj.get(edge.from)!.push(edge.to);
  }
  const dummyChains = buildDummyChains(internalNodes, outgoingAdj);

  // Step 4: Horizontal Coordinate Assignment
  const { layoutNodes, positionMap, maxWidth } = assignCoordinates(
    internalNodes,
    nodeMap,
    opts,
    dummyChains
  );

  // Step 5: Edge Routing
  const layoutEdges = routeEdges(edges, positionMap, internalNodes, opts);

  let maxLayer = 0;
  for (const l of updatedLayers.values()) {
    if (l > maxLayer) maxLayer = l;
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
 * Step 2: Insert dummy nodes for edges spanning multiple layers.
 * Replaces long edges with chains through dummy nodes.
 */
function insertDummyNodes(
  nodes: Map<string, InternalNode>,
  edges: InternalEdge[],
  layers: Map<string, number>
): { nodes: Map<string, InternalNode>; edges: InternalEdge[]; layers: Map<string, number> } {
  const newNodes = new Map(nodes);
  const newLayers = new Map(layers);
  const newEdges: InternalEdge[] = [];
  let dummyCounter = 0;

  for (const edge of edges) {
    const fromLayer = newLayers.get(edge.from)!;
    const toLayer = newLayers.get(edge.to)!;

    if (toLayer - fromLayer <= 1) {
      // Single layer span - keep original edge
      newEdges.push(edge);
      continue;
    }

    // Multi-layer span - insert dummy nodes
    let prevNode = edge.from;
    for (let l = fromLayer + 1; l < toLayer; l++) {
      const dummyId = `__dummy_e${dummyCounter}_L${l}`;
      dummyCounter++;

      const dummyNode: InternalNode = {
        id: dummyId,
        layer: l,
        isDummy: true,
        order: 0,
      };
      newNodes.set(dummyId, dummyNode);
      newLayers.set(dummyId, l);

      newEdges.push({ from: prevNode, to: dummyId });
      prevNode = dummyId;
    }

    // Connect last dummy to target
    newEdges.push({ from: prevNode, to: edge.to });
  }

  return { nodes: newNodes, edges: newEdges, layers: newLayers };
}

/**
 * Step 3: Cross minimization using barycenter heuristic.
 * 4 passes: top-down, bottom-up, top-down, bottom-up.
 */
function minimizeCrossings(
  nodes: Map<string, InternalNode>,
  edges: InternalEdge[]
): void {
  // Build adjacency for quick lookup
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const node of nodes.values()) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }

  for (const edge of edges) {
    outgoing.get(edge.from)!.push(edge.to);
    incoming.get(edge.to)!.push(edge.from);
  }

  // Group all nodes by layer (dummy nodes must participate in cross-minimization)
  const layerGroups = new Map<number, InternalNode[]>();
  for (const node of nodes.values()) {
    const l = node.layer;
    if (!layerGroups.has(l)) {
      layerGroups.set(l, []);
    }
    layerGroups.get(l)!.push(node);
  }

  let maxLayer = 0;
  for (const key of layerGroups.keys()) {
    if (key > maxLayer) maxLayer = key;
  }

  // 4 passes of barycenter sorting
  for (let pass = 0; pass < 4; pass++) {
    if (pass % 2 === 0) {
      // Top-down: fix layer 0, sort layer 1 by avg parent positions, etc.
      for (let l = 1; l <= maxLayer; l++) {
        sortLayerByBarycenter(l, layerGroups, incoming);
      }
    } else {
      // Bottom-up: fix max layer, sort backwards
      for (let l = maxLayer - 1; l >= 0; l--) {
        sortLayerByBarycenter(l, layerGroups, outgoing);
      }
    }
  }

  // Intentional in-place mutation: InternalNode objects are created fresh
  // inside computeDagLayout and never escape — updating order here is safe.
  for (const [_layer, nodesInLayer] of layerGroups) {
    nodesInLayer.forEach((node, index) => {
      node.order = index;
    });
  }
}

/**
 * Sort a layer by barycenter values (average position of connected nodes in adjacent layer).
 * Uses stable sort to preserve original order for ties.
 */
function sortLayerByBarycenter(
  layer: number,
  layerGroups: Map<number, InternalNode[]>,
  adjacency: Map<string, string[]>
): void {
  const nodesInLayer = layerGroups.get(layer);
  if (!nodesInLayer || nodesInLayer.length <= 1) return;

  // Compute barycenter for each node
  const barycenters = new Map<string, number>();
  const positionMap = new Map<string, number>();

  // First, get current positions of all nodes in reference layers
  for (const [_l, nodesInRefLayer] of layerGroups) {
    nodesInRefLayer.forEach((node, index) => {
      positionMap.set(node.id, index);
    });
  }

  for (const node of nodesInLayer) {
    const connected = adjacency.get(node.id) || [];
    if (connected.length === 0) {
      barycenters.set(node.id, 0);
      continue;
    }

    let sum = 0;
    let count = 0;
    for (const connId of connected) {
      const pos = positionMap.get(connId);
      if (pos !== undefined) {
        sum += pos;
        count++;
      }
    }

    barycenters.set(node.id, count > 0 ? sum / count : 0);
  }

  // Stable sort by barycenter
  nodesInLayer.sort((a, b) => {
    const ba = barycenters.get(a.id) ?? 0;
    const bb = barycenters.get(b.id) ?? 0;
    return ba - bb;
  });
}

/**
 * Step 4: Assign horizontal coordinates based on layer ordering.
 * Pass 1: Position real nodes only (dummies excluded from layer width).
 * Pass 2: Position dummy nodes via linear interpolation between their chain endpoints.
 */
function assignCoordinates(
  internalNodes: Map<string, InternalNode>,
  nodeMap: Map<string, PlanNode>,
  opts: Required<LayoutOptions>,
  dummyChains: Map<string, DummyChainInfo>
): {
  layoutNodes: LayoutNode[];
  positionMap: Map<string, { x: number; y: number }>;
  maxWidth: number;
} {
  // Group by layer — real nodes only for width calculation
  const realLayerGroups = new Map<number, InternalNode[]>();
  for (const node of internalNodes.values()) {
    if (node.isDummy) continue;
    const l = node.layer;
    if (!realLayerGroups.has(l)) {
      realLayerGroups.set(l, []);
    }
    realLayerGroups.get(l)!.push(node);
  }

  let maxLayer = 0;
  for (const node of internalNodes.values()) {
    if (node.layer > maxLayer) maxLayer = node.layer;
  }

  // Seeded random for deterministic jitter
  const seededRandom = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash | 0;
    }
    return ((Math.abs(hash) % 1000) / 1000) * 2 - 1;
  };

  const layoutNodes: LayoutNode[] = [];
  const positionMap = new Map<string, { x: number; y: number }>();
  let maxWidth = 0;

  // Pass 1: Position real nodes only
  for (let layer = 0; layer <= maxLayer; layer++) {
    const realNodes = realLayerGroups.get(layer) || [];
    const sortedReal = [...realNodes].sort((a, b) => a.order - b.order);

    const layerWidth =
      sortedReal.length * opts.nodeWidth +
      Math.max(0, sortedReal.length - 1) * opts.horizontalSpacing;
    maxWidth = Math.max(maxWidth, layerWidth);

    const startX = -layerWidth / 2;
    const y = layer * (opts.nodeHeight + opts.verticalSpacing);

    for (let i = 0; i < sortedReal.length; i++) {
      const internalNode = sortedReal[i];
      const planNode = nodeMap.get(internalNode.id)!;
      const jitterX = seededRandom(internalNode.id + 'x') * opts.jitter;
      const jitterY = seededRandom(internalNode.id + 'y') * opts.jitter;
      const x = startX + i * (opts.nodeWidth + opts.horizontalSpacing) + opts.nodeWidth / 2 + jitterX;

      layoutNodes.push({
        id: internalNode.id,
        x,
        y: y + jitterY,
        layer: internalNode.layer,
        node: planNode,
      });

      positionMap.set(internalNode.id, { x, y: y + jitterY });
    }
  }

  // Pass 2: Position dummy nodes by routing edges around outermost nodes

  // Step 2a: Build layer bounds (leftmost and rightmost X for each layer)
  const layerBounds = new Map<number, { leftmostX: number; rightmostX: number }>();
  for (const [layer, realNodes] of realLayerGroups) {
    if (realNodes.length === 0) continue;
    const sortedReal = [...realNodes].sort((a, b) => a.order - b.order);
    const layerWidth =
      sortedReal.length * opts.nodeWidth +
      Math.max(0, sortedReal.length - 1) * opts.horizontalSpacing;
    const startX = -layerWidth / 2;

    // Get positions of first and last node in layer
    const firstX = startX + opts.nodeWidth / 2;
    const lastX = startX + (sortedReal.length - 1) * (opts.nodeWidth + opts.horizontalSpacing) + opts.nodeWidth / 2;

    layerBounds.set(layer, { leftmostX: firstX, rightmostX: lastX });
  }

  // Step 2b: Group dummies by edge for consistent routing
  const edgeGroups = new Map<string, { dummyId: string; layer: number }[]>();
  for (const [dummyId, chainInfo] of dummyChains) {
    const edgeKey = `${chainInfo.realFrom}||${chainInfo.realTo}`;
    if (!edgeGroups.has(edgeKey)) {
      edgeGroups.set(edgeKey, []);
    }
    edgeGroups.get(edgeKey)!.push({
      dummyId,
      layer: internalNodes.get(dummyId)?.layer ?? 0,
    });
  }

  // Step 2c: Track lane offsets per side per layer to prevent overlapping
  const leftLaneIndex = new Map<number, number>();
  const rightLaneIndex = new Map<number, number>();

  // Step 2d: Position dummies for each edge
  for (const [edgeKey, dummies] of edgeGroups) {
    if (dummies.length === 0) continue;

    // Get source and target positions
    const [fromId, toId] = edgeKey.split('||');
    const fromPos = positionMap.get(fromId);
    const toPos = positionMap.get(toId);
    if (!fromPos || !toPos) continue;

    // Compute midpoint to determine routing side
    const midpointX = (fromPos.x + toPos.x) / 2;

    // Sort dummies by layer
    dummies.sort((a, b) => a.layer - b.layer);

    // Determine routing side once using the first dummy's layer bounds
    const firstBounds = layerBounds.get(dummies[0].layer);
    if (!firstBounds) {
      // No real nodes in first dummy's layer — fall back all to interpolation
      for (const { dummyId, layer } of dummies) {
        const chainInfo = dummyChains.get(dummyId);
        if (chainInfo) {
          const t = chainInfo.index / (chainInfo.total + 1);
          const x = fromPos.x + (toPos.x - fromPos.x) * t;
          const y = layer * (opts.nodeHeight + opts.verticalSpacing);
          positionMap.set(dummyId, { x, y });
        }
      }
      continue;
    }

    const layerCenter = (firstBounds.leftmostX + firstBounds.rightmostX) / 2;
    const routeLeft = midpointX < layerCenter;

    // Allocate a single lane index for this entire edge
    let laneIdx: number;
    if (routeLeft) {
      laneIdx = Math.max(...dummies.map(d => leftLaneIndex.get(d.layer) ?? 0));
      for (const { layer } of dummies) leftLaneIndex.set(layer, laneIdx + 1);
    } else {
      laneIdx = Math.max(...dummies.map(d => rightLaneIndex.get(d.layer) ?? 0));
      for (const { layer } of dummies) rightLaneIndex.set(layer, laneIdx + 1);
    }

    // Position each dummy in the chain using the consistent lane
    for (const { dummyId, layer } of dummies) {
      const bounds = layerBounds.get(layer);
      if (!bounds) {
        // No real nodes in this layer — fall back to linear interpolation
        const chainInfo = dummyChains.get(dummyId);
        if (chainInfo) {
          const t = chainInfo.index / (chainInfo.total + 1);
          const x = fromPos.x + (toPos.x - fromPos.x) * t;
          const y = layer * (opts.nodeHeight + opts.verticalSpacing);
          positionMap.set(dummyId, { x, y });
        }
        continue;
      }

      const x = routeLeft
        ? bounds.leftmostX - opts.nodeWidth / 2 - EDGE_PADDING - (laneIdx * LANE_SPACING)
        : bounds.rightmostX + opts.nodeWidth / 2 + EDGE_PADDING + (laneIdx * LANE_SPACING);

      const y = layer * (opts.nodeHeight + opts.verticalSpacing);
      positionMap.set(dummyId, { x, y });

      // Update maxWidth if dummy extends beyond current bounds
      const absX = Math.abs(x);
      if (absX > maxWidth / 2) {
        maxWidth = absX * 2;
      }
    }
  }

  return { layoutNodes, positionMap, maxWidth };
}

/**
 * Step 5: Route edges through dummy nodes using Catmull-Rom splines.
 * Traces chains from real nodes through dummy nodes to the next real node.
 */
function routeEdges(
  edges: InternalEdge[],
  positionMap: Map<string, { x: number; y: number }>,
  internalNodes: Map<string, InternalNode>,
  opts: Required<LayoutOptions>
): LayoutEdge[] {
  const layoutEdges: LayoutEdge[] = [];

  // Build adjacency map for tracing chains
  const outgoing = new Map<string, string[]>();
  for (const [fromId] of internalNodes) {
    outgoing.set(fromId, []);
  }
  for (const edge of edges) {
    outgoing.get(edge.from)!.push(edge.to);
  }

  // Only start from real (non-dummy) nodes
  for (const [fromId, node] of internalNodes) {
    if (node.isDummy) continue;

    for (const toId of outgoing.get(fromId) || []) {

      const fromPos = positionMap.get(fromId);
      if (!fromPos) continue;

      // Trace the chain: fromId -> [dummy nodes] -> finalTarget
      const chain = traceChain(fromId, toId, outgoing, internalNodes);
      const toNodeId = chain[chain.length - 1];
      const toPos = positionMap.get(toNodeId);
      if (!toPos) continue;

      const adjustedFromPos = {
        x: fromPos.x,
        y: fromPos.y + opts.nodeHeight / 2,
      };
      const adjustedToPos = {
        x: toPos.x,
        y: toPos.y - (internalNodes.get(toNodeId)?.isDummy ? 0 : opts.nodeHeight / 2),
      };

      // Collect bend points (dummy nodes in the middle of the chain)
      const bendPoints = chain
        .slice(1, -1)
        .map((id) => positionMap.get(id))
        .filter((p): p is { x: number; y: number } => p !== undefined);

      layoutEdges.push({
        from: fromId,
        to: toNodeId,
        fromPos: adjustedFromPos,
        toPos: adjustedToPos,
        bendPoints: bendPoints.length > 0 ? bendPoints : undefined,
      });
    }
  }

  return layoutEdges;
}

/**
 * Trace a chain from start node through dummy nodes to the final target.
 * Returns array of node IDs in the chain.
 */
function traceChain(
  startId: string,
  nextId: string,
  outgoing: Map<string, string[]>,
  internalNodes: Map<string, InternalNode>
): string[] {
  const chain: string[] = [startId, nextId];
  const visited = new Set<string>([startId, nextId]);

  let current = nextId;
  while (current) {
    const node = internalNodes.get(current);
    if (!node?.isDummy) break; // Stop at real node

    const targets = outgoing.get(current);
    if (!targets || targets.length !== 1) break; // Should only have one outgoing

    const next = targets[0];
    if (visited.has(next)) break; // Cycle guard
    visited.add(next);

    current = next;
    chain.push(current);
  }

  return chain;
}

interface DummyChainInfo {
  realFrom: string;
  realTo: string;
  index: number;   // 1-based position in chain
  total: number;   // number of dummies in chain
}

/**
 * Build a lookup mapping each dummy node to its chain context.
 * For chain [A, d1, d2, d3, B]: d1→{index:1,total:3}, d2→{index:2,total:3}, d3→{index:3,total:3}.
 */
function buildDummyChains(
  internalNodes: Map<string, InternalNode>,
  outgoing: Map<string, string[]>
): Map<string, DummyChainInfo> {
  const chainMap = new Map<string, DummyChainInfo>();

  for (const [fromId, node] of internalNodes) {
    if (node.isDummy) continue;

    for (const toId of outgoing.get(fromId) || []) {
      const chain = traceChain(fromId, toId, outgoing, internalNodes);
      // chain = [realFrom, ...dummies, realTo]
      const dummies = chain.slice(1, -1);
      const realTo = chain[chain.length - 1];

      for (let i = 0; i < dummies.length; i++) {
        chainMap.set(dummies[i], {
          realFrom: fromId,
          realTo,
          index: i + 1,
          total: dummies.length,
        });
      }
    }
  }

  return chainMap;
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

  const nodeIds = new Set(nodes.map((n) => n.node_id));

  function computeLayer(nodeId: string): number {
    if (layers.has(nodeId)) {
      return layers.get(nodeId)!;
    }

    if (visited.has(nodeId)) {
      return 0;
    }

    visited.add(nodeId);

    const deps = dependencies.get(nodeId) || [];
    const validDeps = deps.filter((d) => nodeIds.has(d));

    if (validDeps.length === 0) {
      layers.set(nodeId, 0);
      return 0;
    }

    let maxDepLayer = 0;
    for (const dep of validDeps) {
      const depLayer = computeLayer(dep);
      if (depLayer > maxDepLayer) maxDepLayer = depLayer;
    }
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

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const n of layout.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    ...layout,
    nodes: layout.nodes.map((n) => ({
      ...n,
      x: n.x - centerX,
      y: n.y - centerY,
    })),
    edges: layout.edges.map((e) => {
      const centered: LayoutEdge = {
        ...e,
        fromPos: { x: e.fromPos.x - centerX, y: e.fromPos.y - centerY },
        toPos: { x: e.toPos.x - centerX, y: e.toPos.y - centerY },
      };
      if (e.bendPoints) {
        centered.bendPoints = e.bendPoints.map((p) => ({
          x: p.x - centerX,
          y: p.y - centerY,
        }));
      }
      return centered;
    }),
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

  return Math.min(Math.max(Math.min(scaleX, scaleY), 0.25), 1.5);
}
