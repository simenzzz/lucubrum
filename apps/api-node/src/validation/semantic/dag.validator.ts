/**
 * DAG (Directed Acyclic Graph) validator for learning plan prerequisites.
 *
 * Ensures the prerequisite graph has no cycles and all references are valid.
 */

export interface NodeForValidation {
  node_id: string;
  prerequisites: string[];
}

export interface DagValidationResult {
  valid: boolean;
  errors: string[];
  hasCycle: boolean;
  cycleNodes?: string[];
  invalidReferences?: Array<{ node_id: string; invalid_prereq: string }>;
  selfReferences?: string[];
}

// Node coloring for DFS cycle detection
enum NodeColor {
  WHITE = 0, // Unvisited
  GRAY = 1, // Currently visiting (in stack)
  BLACK = 2, // Finished visiting
}

/**
 * Validate that the prerequisite graph forms a valid DAG.
 *
 * Checks:
 * 1. All prerequisites reference existing nodes
 * 2. No node references itself as a prerequisite
 * 3. No cycles exist in the prerequisite graph
 */
export function validateDag(nodes: NodeForValidation[]): DagValidationResult {
  const errors: string[] = [];
  const nodeIds = new Set(nodes.map((n) => n.node_id));
  const nodeMap = new Map(nodes.map((n) => [n.node_id, n]));

  // Check for invalid references and self-references
  const invalidReferences: Array<{ node_id: string; invalid_prereq: string }> = [];
  const selfReferences: string[] = [];

  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (prereq === node.node_id) {
        selfReferences.push(node.node_id);
        errors.push(`Node '${node.node_id}' references itself as a prerequisite`);
      } else if (!nodeIds.has(prereq)) {
        invalidReferences.push({ node_id: node.node_id, invalid_prereq: prereq });
        errors.push(`Node '${node.node_id}' has unknown prerequisite '${prereq}'`);
      }
    }
  }

  // Check for cycles using DFS with coloring (excluding self-references)
  const { hasCycle, cycleNodes } = detectCycle(nodes, nodeMap);

  if (hasCycle) {
    errors.push(`Cycle detected in prerequisites: ${cycleNodes?.join(' -> ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    hasCycle,
    cycleNodes: hasCycle ? cycleNodes : undefined,
    invalidReferences: invalidReferences.length > 0 ? invalidReferences : undefined,
    selfReferences: selfReferences.length > 0 ? selfReferences : undefined,
  };
}

/**
 * Detect cycles in the prerequisite graph using DFS with coloring.
 *
 * Self-references are excluded from cycle detection since they are
 * caught separately as self-reference errors.
 *
 * Returns the cycle path if found.
 */
function detectCycle(
  nodes: NodeForValidation[],
  nodeMap: Map<string, NodeForValidation>
): { hasCycle: boolean; cycleNodes?: string[] } {
  const colors = new Map<string, NodeColor>();

  // Initialize all nodes as WHITE (unvisited)
  for (const node of nodes) {
    colors.set(node.node_id, NodeColor.WHITE);
  }

  // Track path for cycle reconstruction
  const path: string[] = [];

  function dfs(nodeId: string): string[] | null {
    const color = colors.get(nodeId);

    // Skip if node doesn't exist (already caught by invalid reference check)
    if (color === undefined) {
      return null;
    }

    // Found a cycle - node is currently being visited
    if (color === NodeColor.GRAY) {
      // Find the start of the cycle in the path
      const cycleStart = path.indexOf(nodeId);
      return [...path.slice(cycleStart), nodeId];
    }

    // Already fully processed - no cycle through this node
    if (color === NodeColor.BLACK) {
      return null;
    }

    // Mark as currently visiting
    colors.set(nodeId, NodeColor.GRAY);
    path.push(nodeId);

    // Visit all prerequisites (nodes that must come before)
    // Skip self-references since they are caught separately
    const node = nodeMap.get(nodeId);
    if (node) {
      for (const prereq of node.prerequisites) {
        // Skip self-reference edges in cycle detection
        // (A -> A is already caught as a self-reference error)
        if (prereq === nodeId) {
          continue;
        }
        const cycle = dfs(prereq);
        if (cycle) {
          return cycle;
        }
      }
    }

    // Mark as finished
    colors.set(nodeId, NodeColor.BLACK);
    path.pop();

    return null;
  }

  // Check all nodes (graph may be disconnected)
  for (const node of nodes) {
    if (colors.get(node.node_id) === NodeColor.WHITE) {
      const cycle = dfs(node.node_id);
      if (cycle) {
        return { hasCycle: true, cycleNodes: cycle };
      }
    }
  }

  return { hasCycle: false };
}

export default validateDag;
