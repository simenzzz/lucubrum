/**
 * Prerequisite order validator for learning plan schedules.
 *
 * Ensures all prerequisites appear before their dependents in the schedule.
 */

export interface ScheduleItem {
  order: number;
  node_id: string;
}

export interface NodeForPrereqValidation {
  node_id: string;
  prerequisites: string[];
}

export interface PrereqViolation {
  node_id: string;
  prerequisite: string;
  nodeOrder: number;
  prereqOrder: number;
}

export interface PrereqValidationResult {
  valid: boolean;
  errors: string[];
  violatingNodes: PrereqViolation[];
}

/**
 * Validate that prerequisites appear before their dependents in the schedule.
 *
 * For each node in the schedule, all its prerequisites must have a lower order number.
 */
export function validatePrerequisiteOrder(
  nodes: NodeForPrereqValidation[],
  schedule: ScheduleItem[]
): PrereqValidationResult {
  const errors: string[] = [];
  const violations: PrereqViolation[] = [];

  // Build a map of node_id to schedule order
  const orderMap = new Map<string, number>();
  for (const item of schedule) {
    orderMap.set(item.node_id, item.order);
  }

  // Build a map of node_id to prerequisites
  const nodeMap = new Map<string, string[]>();
  for (const node of nodes) {
    nodeMap.set(node.node_id, node.prerequisites);
  }

  // Check each scheduled node
  for (const item of schedule) {
    const prerequisites = nodeMap.get(item.node_id);
    if (!prerequisites) {
      continue;
    }

    for (const prereq of prerequisites) {
      const prereqOrder = orderMap.get(prereq);

      // If prereq is not in schedule, skip (caught by DAG validator)
      if (prereqOrder === undefined) {
        continue;
      }

      // Prerequisite must come before the dependent node
      if (prereqOrder >= item.order) {
        const violation: PrereqViolation = {
          node_id: item.node_id,
          prerequisite: prereq,
          nodeOrder: item.order,
          prereqOrder: prereqOrder,
        };
        violations.push(violation);
        errors.push(
          `Node '${item.node_id}' (order ${item.order}) has prerequisite '${prereq}' ` +
            `scheduled at order ${prereqOrder} (should be earlier)`
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    errors,
    violatingNodes: violations,
  };
}

/**
 * Check if a schedule represents a valid topological order for the DAG.
 *
 * This is equivalent to checking that all prerequisites come before dependents.
 */
export function isTopologicalOrder(
  nodes: NodeForPrereqValidation[],
  schedule: ScheduleItem[]
): boolean {
  const result = validatePrerequisiteOrder(nodes, schedule);
  return result.valid;
}

export default validatePrerequisiteOrder;
