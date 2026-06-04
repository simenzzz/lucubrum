import { describe, expect, it } from '@jest/globals';
import { SubmitExamRequestSchema } from '../../../src/validation/schemas';

describe('API validation schemas', () => {
  describe('SubmitExamRequestSchema', () => {
    it('accepts fill-blank answer arrays in exam submissions', () => {
      const result = SubmitExamRequestSchema.safeParse({
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        answers: [
          {
            exercise_id: 'fill-blank-1',
            user_answer: ['first answer', 'second answer'],
          },
        ],
      });

      expect(result.success).toBe(true);
    });
  });
});
