/**
 * Prerequisite validator tests
 * Tests for prereq.validator.ts: validatePrerequisiteOrder, isTopologicalOrder functions
 */

import { describe, it, expect } from '@jest/globals';
import {
  validatePrerequisiteOrder,
  isTopologicalOrder,
  type NodeForPrereqValidation,
  type ScheduleItem,
} from '../../../../src/validation/semantic/prereq.validator';

describe('Prerequisite Validator', () => {
  describe('validatePrerequisiteOrder', () => {
    describe('valid schedules', () => {
      it('should return true for valid order (prerequisites before dependents)', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: ['A'] },
          { node_id: 'C', prerequisites: ['A', 'B'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 2, node_id: 'B' },
          { order: 3, node_id: 'C' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.violatingNodes).toHaveLength(0);
      });

      it('should return true for empty schedule', () => {
        const nodes: NodeForPrereqValidation[] = [];
        const schedule: ScheduleItem[] = [];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return true for nodes with no prerequisites', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: [] },
          { node_id: 'C', prerequisites: [] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 2, node_id: 'B' },
          { order: 3, node_id: 'C' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return true for diamond dependency pattern', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: ['A'] },
          { node_id: 'C', prerequisites: ['A'] },
          { node_id: 'D', prerequisites: ['B', 'C'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 2, node_id: 'B' },
          { order: 3, node_id: 'C' },
          { order: 4, node_id: 'D' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should return true for complex valid schedule', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'basics', prerequisites: [] },
          { node_id: 'variables', prerequisites: ['basics'] },
          { node_id: 'functions', prerequisites: ['basics', 'variables'] },
          { node_id: 'arrays', prerequisites: ['variables'] },
          { node_id: 'objects', prerequisites: ['arrays'] },
          { node_id: 'classes', prerequisites: ['functions', 'objects'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'basics' },
          { order: 2, node_id: 'variables' },
          { order: 3, node_id: 'arrays' },
          { order: 4, node_id: 'functions' },
          { order: 5, node_id: 'objects' },
          { order: 6, node_id: 'classes' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('invalid schedules', () => {
      it('should return false when prerequisite is after dependent', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: ['B'] }, // A requires B
          { node_id: 'B', prerequisites: [] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' }, // A comes first, but needs B
          { order: 2, node_id: 'B' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(false);
        expect(result.violatingNodes).toHaveLength(1);
        expect(result.violatingNodes[0]).toEqual({
          node_id: 'A',
          prerequisite: 'B',
          nodeOrder: 1,
          prereqOrder: 2,
        });
        expect(result.errors[0]).toContain("Node 'A'");
        expect(result.errors[0]).toContain("prerequisite 'B'");
        expect(result.errors[0]).toContain('should be earlier');
      });

      it('should return false for same order position (prerequisite at same position as dependent)', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: ['B'] },
          { node_id: 'B', prerequisites: [] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 1, node_id: 'B' }, // Same order as A
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(false);
        expect(result.violatingNodes).toHaveLength(1);
        expect(result.violatingNodes[0].nodeOrder).toBe(1);
        expect(result.violatingNodes[0].prereqOrder).toBe(1);
      });

      it('should detect multiple violations', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: ['C'] }, // C comes after A
          { node_id: 'B', prerequisites: ['D'] }, // D comes after B
          { node_id: 'C', prerequisites: [] },
          { node_id: 'D', prerequisites: [] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 2, node_id: 'B' },
          { order: 3, node_id: 'C' },
          { order: 4, node_id: 'D' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(false);
        expect(result.violatingNodes).toHaveLength(2);
        expect(result.errors).toHaveLength(2);

        // Check A -> C violation
        const aViolation = result.violatingNodes.find((v) => v.node_id === 'A');
        expect(aViolation).toBeDefined();
        expect(aViolation!.prerequisite).toBe('C');
        expect(aViolation!.nodeOrder).toBe(1);
        expect(aViolation!.prereqOrder).toBe(3);

        // Check B -> D violation
        const bViolation = result.violatingNodes.find((v) => v.node_id === 'B');
        expect(bViolation).toBeDefined();
        expect(bViolation!.prerequisite).toBe('D');
        expect(bViolation!.nodeOrder).toBe(2);
        expect(bViolation!.prereqOrder).toBe(4);
      });

      it('should detect violation in complex schedule', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: ['A'] },
          { node_id: 'C', prerequisites: ['D'] }, // C requires D but D comes after
          { node_id: 'D', prerequisites: ['B'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 2, node_id: 'B' },
          { order: 3, node_id: 'C' }, // Violation: D not yet seen
          { order: 4, node_id: 'D' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(false);
        expect(result.violatingNodes).toHaveLength(1);
        expect(result.violatingNodes[0].node_id).toBe('C');
        expect(result.violatingNodes[0].prerequisite).toBe('D');
      });
    });

    describe('edge cases', () => {
      it('should handle nodes not in schedule gracefully', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: ['X'] }, // X not in schedule
          { node_id: 'B', prerequisites: [] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 2, node_id: 'B' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        // Should be valid because we skip prerequisites not in schedule
        // (they're caught by DAG validator)
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle gaps in order numbers', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: ['A'] },
          { node_id: 'C', prerequisites: ['B'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 5, node_id: 'B' }, // Gap
          { order: 10, node_id: 'C' }, // Gap
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(true);
      });

      it('should handle non-sequential order numbers', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: ['A'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 100, node_id: 'A' },
          { order: 200, node_id: 'B' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(true);
      });

      it('should handle node with multiple prerequisites where some violate', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: [] },
          { node_id: 'C', prerequisites: [] },
          { node_id: 'D', prerequisites: ['A', 'B', 'C'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 2, node_id: 'D' }, // Violation: B and C not yet seen
          { order: 3, node_id: 'B' },
          { order: 4, node_id: 'C' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(false);
        expect(result.violatingNodes).toHaveLength(2);
        expect(result.violatingNodes.map((v) => v.prerequisite).sort()).toEqual(['B', 'C']);
      });

      it('should handle reverse order (completely invalid schedule)', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: ['A'] },
          { node_id: 'C', prerequisites: ['B'] },
          { node_id: 'D', prerequisites: ['C'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'D' }, // All violations
          { order: 2, node_id: 'C' },
          { order: 3, node_id: 'B' },
          { order: 4, node_id: 'A' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        expect(result.valid).toBe(false);
        expect(result.violatingNodes.length).toBeGreaterThan(0);
      });
    });

    describe('partial schedule scenarios', () => {
      it('should handle schedule with only some nodes', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: ['A'] },
          { node_id: 'C', prerequisites: ['B'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'A' },
          { order: 2, node_id: 'B' },
          // C not in schedule
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        // Should be valid - we only check what's in the schedule
        expect(result.valid).toBe(true);
      });

      it('should validate only scheduled nodes', () => {
        const nodes: NodeForPrereqValidation[] = [
          { node_id: 'A', prerequisites: [] },
          { node_id: 'B', prerequisites: ['A'] },
          { node_id: 'C', prerequisites: ['B'] },
        ];

        const schedule: ScheduleItem[] = [
          { order: 1, node_id: 'B' }, // B's prerequisite A is not in schedule
          { order: 2, node_id: 'C' },
        ];

        const result = validatePrerequisiteOrder(nodes, schedule);

        // Should be valid because A is not in schedule to check
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('isTopologicalOrder', () => {
    it('should return true for valid topological order', () => {
      const nodes: NodeForPrereqValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: ['A'] },
        { node_id: 'C', prerequisites: ['B'] },
      ];

      const schedule: ScheduleItem[] = [
        { order: 1, node_id: 'A' },
        { order: 2, node_id: 'B' },
        { order: 3, node_id: 'C' },
      ];

      const result = isTopologicalOrder(nodes, schedule);

      expect(result).toBe(true);
    });

    it('should return false for invalid topological order', () => {
      const nodes: NodeForPrereqValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: ['A'] },
        { node_id: 'C', prerequisites: ['B'] },
      ];

      const schedule: ScheduleItem[] = [
        { order: 1, node_id: 'B' }, // Invalid: A should come first
        { order: 2, node_id: 'A' },
        { order: 3, node_id: 'C' },
      ];

      const result = isTopologicalOrder(nodes, schedule);

      expect(result).toBe(false);
    });

    it('should return true for empty inputs', () => {
      const result = isTopologicalOrder([], []);

      expect(result).toBe(true);
    });

    it('should return true for nodes with no prerequisites in any order', () => {
      const nodes: NodeForPrereqValidation[] = [
        { node_id: 'A', prerequisites: [] },
        { node_id: 'B', prerequisites: [] },
        { node_id: 'C', prerequisites: [] },
      ];

      const schedule: ScheduleItem[] = [
        { order: 1, node_id: 'C' },
        { order: 2, node_id: 'A' },
        { order: 3, node_id: 'B' },
      ];

      const result = isTopologicalOrder(nodes, schedule);

      expect(result).toBe(true);
    });
  });

  describe('real-world scenarios', () => {
    it('should validate a JavaScript learning plan schedule', () => {
      const nodes: NodeForPrereqValidation[] = [
        { node_id: 'basics', prerequisites: [] },
        { node_id: 'variables', prerequisites: ['basics'] },
        { node_id: 'functions', prerequisites: ['basics', 'variables'] },
        { node_id: 'arrays', prerequisites: ['variables'] },
        { node_id: 'objects', prerequisites: ['arrays'] },
        { node_id: 'async', prerequisites: ['functions'] },
        { node_id: 'classes', prerequisites: ['objects', 'functions'] },
        { node_id: 'promises', prerequisites: ['async', 'functions'] },
      ];

      const schedule: ScheduleItem[] = [
        { order: 1, node_id: 'basics' },
        { order: 2, node_id: 'variables' },
        { order: 3, node_id: 'arrays' },
        { order: 4, node_id: 'objects' },
        { order: 5, node_id: 'functions' },
        { order: 6, node_id: 'async' },
        { order: 7, node_id: 'classes' },
        { order: 8, node_id: 'promises' },
      ];

      const result = validatePrerequisiteOrder(nodes, schedule);

      expect(result.valid).toBe(true);
    });

    it('should detect issue in misordered React learning plan', () => {
      const nodes: NodeForPrereqValidation[] = [
        { node_id: 'js-basics', prerequisites: [] },
        { node_id: 'jsx', prerequisites: ['js-basics'] },
        { node_id: 'components', prerequisites: ['jsx'] },
        { node_id: 'props', prerequisites: ['components'] },
        { node_id: 'state', prerequisites: ['components'] },
        { node_id: 'hooks', prerequisites: ['state', 'props'] },
      ];

      const schedule: ScheduleItem[] = [
        { order: 1, node_id: 'js-basics' },
        { order: 2, node_id: 'components' }, // Violation: needs jsx
        { order: 3, node_id: 'jsx' },
        { order: 4, node_id: 'props' },
        { order: 5, node_id: 'state' },
        { order: 6, node_id: 'hooks' },
      ];

      const result = validatePrerequisiteOrder(nodes, schedule);

      expect(result.valid).toBe(false);
      expect(result.violatingNodes[0].node_id).toBe('components');
      expect(result.violatingNodes[0].prerequisite).toBe('jsx');
    });
  });

  describe('error message formatting', () => {
    it('should format error messages correctly', () => {
      const nodes: NodeForPrereqValidation[] = [
        { node_id: 'advanced-topic', prerequisites: ['basic-topic'] },
        { node_id: 'basic-topic', prerequisites: [] },
      ];

      const schedule: ScheduleItem[] = [
        { order: 1, node_id: 'advanced-topic' },
        { order: 2, node_id: 'basic-topic' },
      ];

      const result = validatePrerequisiteOrder(nodes, schedule);

      expect(result.errors[0]).toMatch(/Node 'advanced-topic'/);
      expect(result.errors[0]).toMatch(/order 1/);
      expect(result.errors[0]).toMatch(/prerequisite 'basic-topic'/);
      expect(result.errors[0]).toMatch(/order 2/);
      expect(result.errors[0]).toMatch(/should be earlier/);
    });
  });
});
