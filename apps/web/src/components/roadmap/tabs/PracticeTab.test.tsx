import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeTab } from './PracticeTab';
import type { PlanNode } from '@/types/api.types';

const mutateMock = vi.fn();
let exercises: Array<{ id: string; type: string; prompt: string; difficulty: number; rubric: string }> = [];
let generateError: Error | null = null;
let isGenerating = false;

vi.mock('@/hooks/usePlan', () => ({
  useExercises: () => ({
    data: {
      exercises,
    },
    isLoading: false,
  }),
  useGenerateExercises: () => ({
    mutate: mutateMock,
    isPending: isGenerating,
    error: generateError,
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
  beforeEach(() => {
    exercises = [
      {
        id: 'exercise-1',
        type: 'short_answer',
        prompt: 'Explain closures.',
        difficulty: 2,
        rubric: 'Answer mentions lexical scope.',
      },
    ];
    generateError = null;
    isGenerating = false;
    mutateMock.mockReset();
  });

  it('omits force when generating exercises for the first time', () => {
    exercises = [];

    render(<PracticeTab node={node} planId="plan-1" mastery={0.3} />);

    fireEvent.click(screen.getByRole('button', { name: /generate exercises/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      {
        planId: 'plan-1',
        nodeId: 'intro',
        params: { difficulty_target: 2 },
      },
      expect.any(Object)
    );
  });

  it('sends force when regenerating existing exercises', () => {
    render(<PracticeTab node={node} planId="plan-1" mastery={0.3} />);

    fireEvent.click(screen.getByRole('button', { name: /regenerate exercises/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate exercises/i }));

    expect(mutateMock).toHaveBeenCalledWith(
      {
        planId: 'plan-1',
        nodeId: 'intro',
        params: { difficulty_target: 2, force: true },
      },
      expect.any(Object)
    );
  });

  it('shows first-generation failures', () => {
    exercises = [];
    generateError = new Error('Failed to generate valid exercises after retries');

    render(<PracticeTab node={node} planId="plan-1" mastery={0.3} />);

    expect(screen.getByText('Failed to generate valid exercises after retries')).toBeInTheDocument();
  });

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

  it('shows regeneration failures while restoring existing exercises', () => {
    generateError = new Error('Free plan does not allow exercise regeneration');

    render(<PracticeTab node={node} planId="plan-1" mastery={0.3} />);

    expect(screen.getByText('Explain closures.')).toBeInTheDocument();
    expect(screen.getByText('Free plan does not allow exercise regeneration')).toBeInTheDocument();
  });
});
