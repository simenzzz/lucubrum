/**
 * DAG validator tests
 * Tests for dag.validator.ts: validateDag function
 */

import { describe, it, expect } from '@jest/globals';
import { validateDag, type NodeForValidation } from '../../../../src/validation/semantic/dag.validator';
import {
  PLAN_WITH_CYCLE,
  PLAN_WITH_SELF_REFERENCE,
  PLAN_WITH_INVALID_PREREQ,
  VALID_PLAN_RESPONSE,
} from '../../../../tests/fixtures/llm-responses';

describe('DAG Validator', () => {
  describe('valid plans', () => {
    it('should accept a plan with no prerequisites', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: [] },
        { node_id: 'C', prerequisites: [] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(true);
      expect(result.hasCycle).toBe(false);
      expect(result.errors).toHaveLength(0);
      expect(result.selfReferences).toBeUndefined();
      expect(result.invalidReferences).toBeUndefined();
      expect(result.cycleNodes).toBeUndefined();
    });

    it('should accept a valid linear chain (A -> B -> C)', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: ['A'] },
        { node_id: 'C', prerequisites: ['B'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(true);
      expect(result.hasCycle).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a valid diamond pattern (A -> B,C -> D)', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: ['A'] },
        { node_id: 'C', prerequisites: ['A'] },
        { node_id: 'D', prerequisites: ['B', 'C'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(true);
      expect(result.hasCycle).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept an empty array', () => {
      const result = validateDag([]);

      expect(result.valid).toBe(true);
      expect(result.hasCycle).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept disconnected valid graphs', () => {
      // Two separate chains that don't reference each other
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: ['A'] },
        { node_id: 'C', prerequisites: [] },
        { node_id: 'D', prerequisites: ['C'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(true);
      expect(result.hasCycle).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept the VALID_PLAN_RESPONSE fixture', () => {
      const nodes: NodeForValidation[] = VALID_PLAN_RESPONSE.schedule.map((node) => ({
        node_id: node.node_id,
        prerequisites: node.prerequisites,
      }));

      const result = validateDag(nodes);

      expect(result.valid).toBe(true);
      expect(result.hasCycle).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle complex valid prerequisites', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'basics', prerequisites: [] },
        { node_id: 'variables', prerequisites: ['basics'] },
        { node_id: 'functions', prerequisites: ['basics', 'variables'] },
        { node_id: 'arrays', prerequisites: ['variables'] },
        { node_id: 'objects', prerequisites: ['variables', 'arrays'] },
        { node_id: 'classes', prerequisites: ['functions', 'objects'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(true);
      expect(result.hasCycle).toBe(false);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('self-reference detection', () => {
    it('should detect a node that references itself', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['A'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.hasCycle).toBe(false); // Self-reference is different from cycle
      expect(result.selfReferences).toEqual(['A']);
      expect(result.errors).toContain("Node 'A' references itself as a prerequisite");
    });

    it('should detect multiple self-references', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['A'] },
        { node_id: 'B', prerequisites: ['B'] },
        { node_id: 'C', prerequisites: [] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.selfReferences).toEqual(expect.arrayContaining(['A', 'B']));
      expect(result.selfReferences).toHaveLength(2);
    });

    it('should detect self-reference among valid nodes', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: ['A'] },
        { node_id: 'C', prerequisites: ['C', 'B'] }, // Self-reference
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.selfReferences).toEqual(['C']);
    });

    it('should detect self-reference in PLAN_WITH_SELF_REFERENCE fixture', () => {
      const nodes: NodeForValidation[] = PLAN_WITH_SELF_REFERENCE.schedule.map((node) => ({
        node_id: node.node_id,
        prerequisites: node.prerequisites,
      }));

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.selfReferences).toEqual(['node-self']);
      expect(result.errors).toContain(
        "Node 'node-self' references itself as a prerequisite"
      );
    });
  });

  describe('invalid prerequisite reference detection', () => {
    it('should detect a prerequisite reference to non-existent node', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['X'] }, // X doesn't exist
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.invalidReferences).toEqual([
        { node_id: 'A', invalid_prereq: 'X' },
      ]);
      expect(result.errors).toContain("Node 'A' has unknown prerequisite 'X'");
    });

    it('should detect multiple invalid references', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['X', 'Y'] },
        { node_id: 'B', prerequisites: ['Z'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.invalidReferences).toEqual([
        { node_id: 'A', invalid_prereq: 'X' },
        { node_id: 'A', invalid_prereq: 'Y' },
        { node_id: 'B', invalid_prereq: 'Z' },
      ]);
    });

    it('should detect invalid references in PLAN_WITH_INVALID_PREREQ fixture', () => {
      const nodes: NodeForValidation[] = PLAN_WITH_INVALID_PREREQ.schedule.map((node) => ({
        node_id: node.node_id,
        prerequisites: node.prerequisites,
      }));

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.invalidReferences).toEqual([
        { node_id: 'node-a', invalid_prereq: 'non-existent-node' },
      ]);
    });

    it('should handle mix of valid and invalid references', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: ['A', 'X'] }, // A is valid, X is invalid
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.invalidReferences).toEqual([
        { node_id: 'B', invalid_prereq: 'X' },
      ]);
    });
  });

  describe('cycle detection', () => {
    it('should detect a simple cycle (A -> B -> A)', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['B'] },
        { node_id: 'B', prerequisites: ['A'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.hasCycle).toBe(true);
      expect(result.cycleNodes).toBeDefined();
      // The cycle should include both A and B, starting from one of them
      const cycleStr = result.cycleNodes!.join(' -> ');
      expect(cycleStr).toMatch(/A.*B.*A/);
      expect(result.errors).toContain(
        `Cycle detected in prerequisites: ${cycleStr}`
      );
    });

    it('should detect a cycle in PLAN_WITH_CYCLE fixture', () => {
      const nodes: NodeForValidation[] = PLAN_WITH_CYCLE.schedule.map((node) => ({
        node_id: node.node_id,
        prerequisites: node.prerequisites,
      }));

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.hasCycle).toBe(true);
      expect(result.cycleNodes).toBeDefined();
      const cycleStr = result.cycleNodes!.join(' -> ');
      expect(cycleStr).toMatch(/node-a.*node-b.*node-a/);
    });

    it('should detect a multi-node cycle (A -> B -> C -> A)', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['C'] },
        { node_id: 'B', prerequisites: ['A'] },
        { node_id: 'C', prerequisites: ['B'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.hasCycle).toBe(true);
      expect(result.cycleNodes).toBeDefined();
      expect(result.cycleNodes).toHaveLength(4); // A, C, B, A (cycle closes)
    });

    it('should detect cycle in a larger graph', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['E'] }, // A requires E, creating cycle: A->E->D->C->B->A
        { node_id: 'B', prerequisites: ['A'] },
        { node_id: 'C', prerequisites: ['B'] },
        { node_id: 'D', prerequisites: ['C'] },
        { node_id: 'E', prerequisites: ['D'] }, // E requires D
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.hasCycle).toBe(true);
      expect(result.cycleNodes).toBeDefined();
      // Should find the cycle somewhere in the path
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect a self-referencing cycle separately from DAG cycle', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['A'] }, // Self-reference
        { node_id: 'B', prerequisites: ['C'] },
        { node_id: 'C', prerequisites: ['B'] }, // Cycle B <-> C
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.selfReferences).toContain('A');
      // Self-reference is not considered a "cycle" by the DFS algorithm
      // but it still makes the graph invalid
    });
  });

  describe('combined error scenarios', () => {
    it('should report both self-reference and invalid references', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['A', 'X'] }, // Self + invalid
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.selfReferences).toEqual(['A']);
      expect(result.invalidReferences).toEqual([
        { node_id: 'A', invalid_prereq: 'X' },
      ]);
      expect(result.errors).toHaveLength(2);
    });

    it('should report all errors in a complex invalid graph', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: ['B'] },
        { node_id: 'B', prerequisites: ['A'] }, // Cycle A <-> B
        { node_id: 'C', prerequisites: ['X'] }, // Invalid reference
        { node_id: 'D', prerequisites: ['D'] }, // Self-reference
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(false);
      expect(result.hasCycle).toBe(true);
      expect(result.selfReferences).toEqual(['D']);
      expect(result.invalidReferences).toEqual([
        { node_id: 'C', invalid_prereq: 'X' },
      ]);
      expect(result.errors.length).toBeGreaterThan(2);
    });
  });

  describe('edge cases', () => {
    it('should handle node IDs that are substrings of each other', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'node', prerequisites: [] },
        { node_id: 'node-1', prerequisites: ['node'] },
        { node_id: 'node-12', prerequisites: ['node-1'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle special characters in node IDs', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'node_1', prerequisites: [] },
        { node_id: 'node-2', prerequisites: ['node_1'] },
        { node_id: 'node.3', prerequisites: ['node-2'] },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle a node with many prerequisites', () => {
      const prereqs = Array.from({ length: 100 }, (_, i) => `prereq-${i}`);
      const nodes: NodeForValidation[] = [
        ...prereqs.map((id) => ({ node_id: id, prerequisites: [] })),
        { node_id: 'final', prerequisites: prereqs },
      ];

      const result = validateDag(nodes);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle duplicate prerequisites', () => {
      const nodes: NodeForValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: ['A', 'A', 'A'] }, // Same prereq multiple times
      ];

      const result = validateDag(nodes);

      // This is technically valid (just redundant)
      expect(result.valid).toBe(true);
    });
  });
});
