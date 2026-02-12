import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import superjson from 'superjson';
import type { Exercise, PlanNode } from '@/types/api.types';

export type NodeTab = 'learn' | 'practice' | 'exam';

export interface ExamState {
  sessionId: string;
  exercises: Exercise[];
  examDifficulty: number;
  currentIndex: number;
  answers: Map<string, unknown>;
  startedAt: Date;
  timeLimitSeconds: number;
  isComplete: boolean;
}

interface RoadmapState {
  // Selected node state
  selectedNode: PlanNode | null;
  selectedNodeId: string | null;
  isNodePopupOpen: boolean;
  activeTab: NodeTab;

  // Graph interaction state
  zoomLevel: number;
  panOffset: { x: number; y: number };

  // Exam state
  examState: ExamState | null;
  isExamInProgress: boolean;

  // Actions - Node selection
  selectNode: (node: PlanNode) => void;
  clearSelection: () => void;
  setActiveTab: (tab: NodeTab) => void;
  openNodePopup: () => void;
  closeNodePopup: () => void;

  // Actions - Graph interaction
  setZoom: (zoom: number) => void;
  setPan: (offset: { x: number; y: number }) => void;
  resetView: () => void;

  // Actions - Exam
  startExam: (params: {
    sessionId: string;
    exercises: Exercise[];
    examDifficulty: number;
    timeLimitSeconds: number;
  }) => void;
  setExamAnswer: (exerciseId: string, answer: unknown) => void;
  nextExamQuestion: () => void;
  prevExamQuestion: () => void;
  goToExamQuestion: (index: number) => void;
  completeExam: () => void;
  cancelExam: () => void;
  getUnansweredCount: () => number;
}

/**
 * Custom storage adapter using superjson to handle Map and Date serialization.
 * zustand persist stores { state, version } wrappers — we serialize/deserialize
 * only the `state` portion with superjson to preserve Map/Date types.
 */
const superjsonStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const str = localStorage.getItem(name);
    if (!str) return null;
    try {
      const wrapper = JSON.parse(str);
      if (wrapper.state) {
        wrapper.state = superjson.deserialize(wrapper.state);
      }
      return JSON.stringify(wrapper);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[RoadmapStore] Failed to deserialize state, clearing:', error);
      }
      localStorage.removeItem(name);
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      const wrapper = JSON.parse(value);
      if (wrapper.state) {
        wrapper.state = superjson.serialize(wrapper.state);
      }
      localStorage.setItem(name, JSON.stringify(wrapper));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[RoadmapStore] Failed to serialize state:', error);
      }
      localStorage.setItem(name, value);
    }
  },
  removeItem: (name: string): void => {
    localStorage.removeItem(name);
  },
};

/**
 * Check if an exam has expired based on startedAt and timeLimitSeconds
 */
function isExamExpired(examState: ExamState): boolean {
  const elapsed = Date.now() - examState.startedAt.getTime();
  return elapsed >= examState.timeLimitSeconds * 1000;
}

export const useRoadmapStore = create<RoadmapState>()(
  persist(
    (set, get) => ({
      // Initial state
      selectedNode: null,
      selectedNodeId: null,
      isNodePopupOpen: false,
      activeTab: 'learn',

      zoomLevel: 1,
      panOffset: { x: 0, y: 0 },

      examState: null,
      isExamInProgress: false,

      // Node selection actions
      selectNode: (node: PlanNode) => {
        set({
          selectedNode: node,
          selectedNodeId: node.node_id,
          isNodePopupOpen: true,
          activeTab: 'learn',
        });
      },

      clearSelection: () => {
        set({
          selectedNode: null,
          selectedNodeId: null,
          isNodePopupOpen: false,
        });
      },

      setActiveTab: (tab: NodeTab) => {
        set({ activeTab: tab });
      },

      openNodePopup: () => {
        set({ isNodePopupOpen: true });
      },

      closeNodePopup: () => {
        // Don't close if exam is in progress
        if (get().isExamInProgress) return;
        set({ isNodePopupOpen: false });
      },

      // Graph interaction actions
      setZoom: (zoom: number) => {
        // Clamp zoom between 0.25 and 2
        const clampedZoom = Math.min(Math.max(zoom, 0.25), 2);
        set({ zoomLevel: clampedZoom });
      },

      setPan: (offset: { x: number; y: number }) => {
        set({ panOffset: offset });
      },

      resetView: () => {
        set({ zoomLevel: 1, panOffset: { x: 0, y: 0 } });
      },

      // Exam actions
      startExam: ({ sessionId, exercises, examDifficulty, timeLimitSeconds }) => {
        set({
          examState: {
            sessionId,
            exercises,
            examDifficulty,
            currentIndex: 0,
            answers: new Map(),
            startedAt: new Date(),
            timeLimitSeconds,
            isComplete: false,
          },
          isExamInProgress: true,
          activeTab: 'exam',
        });
      },

      setExamAnswer: (exerciseId: string, answer: unknown) => {
        const examState = get().examState;
        if (!examState) return;

        const newAnswers = new Map(examState.answers);
        newAnswers.set(exerciseId, answer);

        set({
          examState: {
            ...examState,
            answers: newAnswers,
          },
        });
      },

      nextExamQuestion: () => {
        const examState = get().examState;
        if (!examState) return;

        const nextIndex = Math.min(examState.currentIndex + 1, examState.exercises.length - 1);
        set({
          examState: {
            ...examState,
            currentIndex: nextIndex,
          },
        });
      },

      prevExamQuestion: () => {
        const examState = get().examState;
        if (!examState) return;

        const prevIndex = Math.max(examState.currentIndex - 1, 0);
        set({
          examState: {
            ...examState,
            currentIndex: prevIndex,
          },
        });
      },

      goToExamQuestion: (index: number) => {
        const examState = get().examState;
        if (!examState) return;

        const clampedIndex = Math.min(Math.max(index, 0), examState.exercises.length - 1);
        set({
          examState: {
            ...examState,
            currentIndex: clampedIndex,
          },
        });
      },

      completeExam: () => {
        const examState = get().examState;
        if (!examState) return;

        set({
          examState: {
            ...examState,
            isComplete: true,
          },
          isExamInProgress: false,
        });
      },

      cancelExam: () => {
        set({
          examState: null,
          isExamInProgress: false,
          activeTab: 'learn',
        });
      },

      getUnansweredCount: () => {
        const examState = get().examState;
        if (!examState) return 0;

        return examState.exercises.length - examState.answers.size;
      },
    }),
    {
      name: 'learning-helper-roadmap',
      storage: createJSONStorage(() => superjsonStorage),
      // Only persist exam-related state
      partialize: (state) => ({
        examState: state.examState,
        isExamInProgress: state.isExamInProgress,
      }),
      // Handle expired exams on rehydration
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Check if there's an exam that has expired
        if (state.examState && !state.examState.isComplete && isExamExpired(state.examState)) {
          // Auto-complete expired exam
          state.completeExam();
        }
      },
    }
  )
);
