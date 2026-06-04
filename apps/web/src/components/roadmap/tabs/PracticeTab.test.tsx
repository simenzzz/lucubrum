import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PracticeTab } from './PracticeTab';
import type { PlanNode } from '@/types/api.types';

const mutateMock = vi.fn();

vi.mock('@/hooks/usePlan', () => ({
  useExercises: () => ({
    data: {
      exercises: [
        {
          id: 'exercise-1',
          type: 'short_answer',
          prompt: 'Explain closures.',
          difficulty: 2,
          rubric: 'Answer mentions lexical scope.',
        },
      ],
    },
    isLoading: false,
  }),
  useGenerateExercises: () => ({
    mutate: mutateMock,
    isPending: false,
  }),
}));

vi.mock('@/components/exercises/ExerciseCard', () => ({
  ExerciseCard: ({ exercise }: { exercise: { prompt: string } }) => (
    <div>{exercise.prompt}</div>
  ),
}));

const node: PlanNode = {
  node_id: 'intro',
  title: 'Intro',
  objectives: ['Understand basics'],
  prerequisites: [],
  estimated_minutes: 30,
};

describe('PracticeTab', () => {
  it('restores existing exercises when regeneration fails', () => {
    mutateMock.mockImplementation((_input, options) => {
      options.onError?.(new Error('rate limited'));
    });

    render(<PracticeTab node={node} planId="plan-1" mastery={0.3} />);

    expect(screen.getByText('Explain closures.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /regenerate exercises/i }));
    expect(screen.getByText('Choose a difficulty to regenerate exercises')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /generate exercises/i }));

    expect(screen.getByText('Explain closures.')).toBeInTheDocument();
  });
});
