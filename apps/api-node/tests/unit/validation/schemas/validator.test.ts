/**
 * Schema validator tests
 * Tests for schemas/validator.ts: SchemaValidator class and validate function
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { SchemaValidator, type SchemaName } from '../../../../src/validation/schemas/validator';

// Create test instance with explicit schemas path (fixes NODE_ENV path issue)
const testSchemasDir = join(process.cwd(), '..', '..', 'packages', 'contracts', 'schemas');
const schemaValidator = new SchemaValidator(testSchemasDir);

type JsonSchema = {
  $defs?: Record<string, {
    properties?: {
      provider?: { enum?: string[] };
      validation_retry_count?: { maximum?: number };
    };
  }>;
};

function artifactMetadataSchemas(): Array<{ file: string; artifactMetadata: NonNullable<JsonSchema['$defs']>[string] }> {
  return readdirSync(testSchemasDir)
    .filter((file) => file.endsWith('.schema.json'))
    .map((file) => {
      const schema = JSON.parse(
        readFileSync(join(testSchemasDir, file), 'utf-8')
      ) as JsonSchema;
      return {
        file,
        artifactMetadata: schema.$defs?.ArtifactMetadata,
      };
    })
    .filter(
      (entry): entry is { file: string; artifactMetadata: NonNullable<JsonSchema['$defs']>[string] } =>
        entry.artifactMetadata !== undefined
    );
}

function validPlanWithMetadata(metadataOverrides: Record<string, unknown>) {
  return {
    schema_version: 'plan.v1',
    topic: 'JavaScript Basics',
    user_level: 'beginner',
    nodes: [
      {
        node_id: 'variables',
        title: 'Variables and Data Types',
        objectives: ['Learn about let, const, var'],
        prerequisites: [],
        estimated_minutes: 30,
      },
    ],
    schedule: [
      { order: 1, node_id: 'variables' },
    ],
    metadata: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      prompt_version: '1.0',
      created_at: new Date().toISOString(),
      request_id: '550e8400-e29b-41d4-a716-446655440000',
      raw_output_hash: 'a'.repeat(64),
      artifact_hash: 'b'.repeat(64),
      validation_retry_count: 0,
      ...metadataOverrides,
    },
  };
}

describe('SchemaValidator', () => {

  describe('hasSchema', () => {
    it('should return true for existing schemas', () => {
      expect(schemaValidator.hasSchema('plan.v1')).toBe(true);
      expect(schemaValidator.hasSchema('exercise_set.v1')).toBe(true);
      expect(schemaValidator.hasSchema('exam_exercise_set.v1')).toBe(true);
      expect(schemaValidator.hasSchema('grade.v1')).toBe(true);
      expect(schemaValidator.hasSchema('normalize_topic.v1')).toBe(true);
      expect(schemaValidator.hasSchema('reading_material.v1')).toBe(true);
    });

    it('should return false for unknown schemas', () => {
      expect(schemaValidator.hasSchema('unknown.v1' as SchemaName)).toBe(false);
    });
  });

  describe('getLoadedSchemas', () => {
    it('should return list of loaded schemas', () => {
      const schemas = schemaValidator.getLoadedSchemas();

      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      expect(schemas).toContain('plan.v1');
    });
  });

  describe('validate with real schemas', () => {
    // These tests use the actual JSON schemas from packages/contracts

    it('should validate a correct plan structure using real schema', () => {
      const validPlan = validPlanWithMetadata({});

      const result = schemaValidator.validate('plan.v1', validPlan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate plan metadata from Z.ai', () => {
      const validPlan = validPlanWithMetadata({
        provider: 'zai',
        model: 'glm-5.1',
      });

      const result = schemaValidator.validate('plan.v1', validPlan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept retry counts above the default retry limit', () => {
      const validPlan = validPlanWithMetadata({
        validation_retry_count: 3,
      });

      const result = schemaValidator.validate('plan.v1', validPlan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should include Z.ai in every artifact metadata schema', () => {
      const schemas = artifactMetadataSchemas();

      expect(schemas.length).toBeGreaterThan(0);
      for (const { file, artifactMetadata } of schemas) {
        expect(artifactMetadata.properties?.provider?.enum).toEqual(
          expect.arrayContaining(['gemini', 'claude', 'zai'])
        );
        expect(artifactMetadata.properties?.provider?.enum).toEqual(
          expect.arrayContaining(['local', 'none'])
        );
        expect(
          artifactMetadata.properties?.validation_retry_count?.maximum
        ).toBeUndefined();
        expect(file).toMatch(/\.schema\.json$/);
      }
    });

    it('should reject missing required fields', () => {
      const invalidPlan = {
        schema_version: 'plan.v1',
        topic: 'Test',
        // Missing user_level, nodes, schedule, metadata
      };

      const result = schemaValidator.validate('plan.v1', invalidPlan);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid enum values', () => {
      const invalidPlan = {
        schema_version: 'plan.v1',
        topic: 'Test',
        user_level: 'invalid', // Invalid enum
        nodes: [],
        schedule: [],
        metadata: {
          provider: 'invalid',
          model: 'test',
          prompt_version: '1.0',
          created_at: new Date().toISOString(),
          request_id: '550e8400-e29b-41d4-a716-446655440000',
          raw_output_hash: 'c'.repeat(64),
          artifact_hash: 'd'.repeat(64),
          validation_retry_count: 0,
        },
      };

      const result = schemaValidator.validate('plan.v1', invalidPlan);

      expect(result.valid).toBe(false);
    });
  });

  describe('validate unknown schema', () => {
    it('should return schema not found error', () => {
      const result = schemaValidator.validate('unknown.v1' as SchemaName, { foo: 'bar' });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(["Schema 'unknown.v1' not found or not loaded"]);
    });
  });
});
