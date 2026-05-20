import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import superjson from 'superjson';
import type { ExamExercise, PlanNode, SubmitExamResult } from '@/types/api.types';

export type NodeTab = 'learn' | 'practice' | 'exam';

export interface ExamState {
  planId: string;
  nodeId: string;
  sessionId: string;
  exercises: ExamExercise[];
  examDifficulty: number;
  currentIndex: number;
  answers: Map<string, unknown>;
  startedAt: Date;
  timeLimitSeconds: number;
  isComplete: boolean;
  submitResult: SubmitExamResult | null;
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
  examExpiredNeedsSubmit: boolean;

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
    planId: string;
    nodeId: string;
    sessionId: string;
    exercises: ExamExercise[];
    examDifficulty: number;
    timeLimitSeconds: number;
  }) => void;
  setExamAnswer: (exerciseId: string, answer: unknown) => void;
  nextExamQuestion: () => void;
  prevExamQuestion: () => void;
  goToExamQuestion: (index: number) => void;
  completeExam: (result?: SubmitExamResult) => void;
  cancelExam: () => void;
  clearExamState: () => void;
  getUnansweredCount: () => number;
  clearExamExpiredFlag: () => void;
}

type PersistedState = Pick<RoadmapState, 'examState' | 'isExamInProgress' | 'examExpiredNeedsSubmit'>;

/**
 * Custom storage adapter using superjson to handle Map and Date serialization.
 * Uses superjson.stringify/parse at the storage level to avoid double-serialization
 * issues that arise when combining createJSONStorage with a custom replacer.
 */
const superjsonStorage: PersistStorage<PersistedState> = {
  getItem: (name) => {
    const str = localStorage.getItem(name);
    if (!str) return null;
    try {
      return superjson.parse<StorageValue<PersistedState>>(str);
    } catch {
      if (import.meta.env.DEV) {
        console.warn('[RoadmapStore] Failed to deserialize state, clearing');
      }
      localStorage.removeItem(name);
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, superjson.stringify(value));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[RoadmapStore] Failed to serialize state:', error);
      }
    }
  },
  removeItem: (name) => {
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
      examExpiredNeedsSubmit: false,

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
      startExam: ({ planId, nodeId, sessionId, exercises, examDifficulty, timeLimitSeconds }) => {
        set({
          examState: {
            planId,
            nodeId,
            sessionId,
            exercises,
            examDifficulty,
            currentIndex: 0,
            answers: new Map(),
            startedAt: new Date(),
            timeLimitSeconds,
            isComplete: false,
            submitResult: null,
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

      completeExam: (result?: SubmitExamResult) => {
        const examState = get().examState;
        if (!examState) return;

        set({
          examState: {
            ...examState,
            isComplete: true,
            submitResult: result ?? null,
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

      clearExamState: () => {
        set({
          examState: null,
          isExamInProgress: false,
          examExpiredNeedsSubmit: false,
        });
      },

      getUnansweredCount: () => {
        const examState = get().examState;
        if (!examState) return 0;

        return examState.exercises.length - examState.answers.size;
      },

      clearExamExpiredFlag: () => {
        set({ examExpiredNeedsSubmit: false });
      },
    }),
    {
      name: 'lucubrum-roadmap',
      storage: superjsonStorage,
      // Only persist exam-related state
      partialize: (state) => ({
        examState: state.examState,
        isExamInProgress: state.isExamInProgress,
        examExpiredNeedsSubmit: state.examExpiredNeedsSubmit,
      }),
      // Handle expired exams on rehydration
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Migrate: clear exam states that predate planId/nodeId fields
        if (state.examState && (!state.examState.planId || !state.examState.nodeId)) {
          state.examState = null;
          state.isExamInProgress = false;
          state.examExpiredNeedsSubmit = false;
          return;
        }

        // Check if there's an exam that has expired — set flag for ExamTab to auto-submit
        if (state.examState && !state.examState.isComplete && isExamExpired(state.examState)) {
          state.examExpiredNeedsSubmit = true;
        }

        // Migrate: submitResult was added after initial release
        if (state.examState && state.examState.submitResult === undefined) {
          state.examState.submitResult = null;
        }
      },
    }
  )
);
