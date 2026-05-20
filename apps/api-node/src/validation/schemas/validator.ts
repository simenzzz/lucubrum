/**
 * AJV schema validator for Python service responses.
 *
 * Validates LLM-generated artifacts against JSON schemas from packages/contracts/.
 */

import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import logger from '../../utils/logger';

// Schema names that can be validated
export type SchemaName =
  | 'plan.v1'
  | 'exercise_set.v1'
  | 'exam_exercise_set.v1'
  | 'grade.v1'
  | 'normalize_topic.v1'
  | 'query_suggestions.v1'
  | 'reading_material.v1'
  | 'video_validation.v1'
  | 'staleness_result.v1';

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: string[];
  rawErrors?: ErrorObject[];
}

class SchemaValidator {
  private ajv: Ajv;
  private validators: Map<SchemaName, ValidateFunction> = new Map();
  private schemasDir: string;

  constructor(schemasDir?: string) {
    this.schemasDir =
      schemasDir ||
      process.env.SCHEMAS_DIR ||
      join(__dirname, '..', '..', '..', '..', '..', 'packages', 'contracts', 'schemas');

    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: true,
    });

    // Add format validators (date-time, uuid, etc.)
    addFormats(this.ajv);

    // Load all schemas on initialization
    this.loadSchemas();
  }

  /**
   * Load all JSON schemas from the contracts directory.
   */
  private loadSchemas(): void {
    const schemaNames: SchemaName[] = [
      'plan.v1',
      'exercise_set.v1',
      'exam_exercise_set.v1',
      'grade.v1',
      'normalize_topic.v1',
      'query_suggestions.v1',
      'reading_material.v1',
      'video_validation.v1',
      'staleness_result.v1',
    ];

    for (const name of schemaNames) {
      const schemaPath = join(this.schemasDir, `${name}.schema.json`);

      if (!existsSync(schemaPath)) {
        logger.warn({ schemaPath }, `Schema file not found: ${name}`);
        continue;
      }

      try {
        const schemaContent = readFileSync(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);
        const validator = this.ajv.compile(schema);
        this.validators.set(name, validator);
        logger.debug({ name }, 'Schema loaded');
      } catch (error) {
        logger.error({ name, error }, 'Failed to load schema');
      }
    }

    logger.info({ count: this.validators.size }, 'Schemas loaded');
  }

  /**
   * Validate data against a named schema.
   */
  validate<T>(name: SchemaName, data: unknown): ValidationResult<T> {
    const validator = this.validators.get(name);

    if (!validator) {
      return {
        valid: false,
        errors: [`Schema '${name}' not found or not loaded`],
      };
    }

    const valid = validator(data);

    if (valid) {
      return {
        valid: true,
        data: data as T,
        errors: [],
      };
    }

    const errors = this.formatErrors(validator.errors || []);
    return {
      valid: false,
      errors,
      rawErrors: validator.errors || undefined,
    };
  }

  /**
   * Format AJV errors into human-readable strings.
   */
  formatErrors(errors: ErrorObject[]): string[] {
    return errors.map((error) => {
      const path = error.instancePath || '/';
      const message = error.message || 'Unknown error';

      switch (error.keyword) {
        case 'required':
          return `Missing required property '${error.params.missingProperty}' at ${path}`;
        case 'type':
          return `Invalid type at ${path}: expected ${error.params.type}, got ${typeof error.data}`;
        case 'enum':
          return `Invalid value at ${path}: must be one of ${JSON.stringify(error.params.allowedValues)}`;
        case 'pattern':
          return `Invalid format at ${path}: must match pattern ${error.params.pattern}`;
        case 'minLength':
          return `Value at ${path} is too short: minimum length is ${error.params.limit}`;
        case 'maxLength':
          return `Value at ${path} is too long: maximum length is ${error.params.limit}`;
        case 'minimum':
          return `Value at ${path} is too small: minimum is ${error.params.limit}`;
        case 'maximum':
          return `Value at ${path} is too large: maximum is ${error.params.limit}`;
        case 'minItems':
          return `Array at ${path} has too few items: minimum is ${error.params.limit}`;
        case 'maxItems':
          return `Array at ${path} has too many items: maximum is ${error.params.limit}`;
        case 'additionalProperties':
          return `Unknown property '${error.params.additionalProperty}' at ${path}`;
        case 'const':
          return `Value at ${path} must be ${JSON.stringify(error.params.allowedValue)}`;
        default:
          return `Validation error at ${path}: ${message}`;
      }
    });
  }

  /**
   * Check if a schema is loaded and available.
   */
  hasSchema(name: SchemaName): boolean {
    return this.validators.has(name);
  }

  /**
   * Get list of loaded schema names.
   */
  getLoadedSchemas(): SchemaName[] {
    return Array.from(this.validators.keys());
  }
}

// Export singleton instance
export const schemaValidator = new SchemaValidator();
export default schemaValidator;

// Export class for testing with custom schemas dir
export { SchemaValidator };
