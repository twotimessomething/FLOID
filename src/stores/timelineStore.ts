import { create } from 'zustand';
import type { Phase, Element, Milestone } from '../types';
import { createDefaultPhases } from '../data/defaultTemplate';
import { loadFromStorage, saveToStorage } from '../utils/storageUtils';
import { useProjectStore } from './projectStore';

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

interface TimelineState {
  phases: Phase[];
  isInitialized: boolean;

  // Initialization
  initializeFromTemplate: () => void;
  initializeFromStorage: () => boolean;

  // Phase operations
  setPhases: (phases: Phase[]) => void;
  updatePhase: (phaseId: string, updates: Partial<Phase>) => void;
  addPhase: (phase: Omit<Phase, 'id'>) => void;
  deletePhase: (phaseId: string) => void;
  togglePhaseCollapse: (phaseId: string) => void;

  // Element operations
  updateElement: (phaseId: string, elementId: string, updates: Partial<Element>) => void;
  addElement: (phaseId: string, element: Omit<Element, 'id' | 'phaseId'>) => void;
  deleteElement: (phaseId: string, elementId: string) => void;

  // Milestone operations
  updateMilestone: (phaseId: string, milestoneId: string, updates: Partial<Milestone>) => void;
  addMilestone: (phaseId: string, milestone: Omit<Milestone, 'id' | 'parentId' | 'parentType'>) => void;
  deleteMilestone: (phaseId: string, milestoneId: string) => void;

  // Relative position updates (for drag operations)
  updatePhasePosition: (phaseId: string, relativeStart: number, relativeEnd: number) => void;
  updateElementPosition: (
    phaseId: string,
    elementId: string,
    relativeStart: number,
    relativeEnd: number
  ) => void;

  // Save state
  saveState: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  phases: [],
  isInitialized: false,

  initializeFromTemplate: () => {
    // Try to load from storage first
    const stored = loadFromStorage();
    if (stored && stored.phases && stored.phases.length > 0) {
      set({
        phases: stored.phases as Phase[],
        isInitialized: true,
      });
      if (stored.project) {
        useProjectStore.getState().setProject(stored.project as ReturnType<typeof useProjectStore.getState>['project']);
      }
      return;
    }

    // Otherwise use default template
    set({
      phases: createDefaultPhases(),
      isInitialized: true,
    });
  },

  initializeFromStorage: () => {
    const stored = loadFromStorage();
    if (stored && stored.phases) {
      set({
        phases: stored.phases as Phase[],
        isInitialized: true,
      });
      return true;
    }
    return false;
  },

  setPhases: (phases) => set({ phases }),

  updatePhase: (phaseId, updates) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId ? { ...phase, ...updates } : phase
      ),
    })),

  addPhase: (phase) =>
    set((state) => ({
      phases: [...state.phases, { ...phase, id: generateId() }],
    })),

  deletePhase: (phaseId) =>
    set((state) => ({
      phases: state.phases.filter((phase) => phase.id !== phaseId),
    })),

  togglePhaseCollapse: (phaseId) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId ? { ...phase, isCollapsed: !phase.isCollapsed } : phase
      ),
    })),

  updateElement: (phaseId, elementId, updates) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId
          ? {
              ...phase,
              elements: phase.elements.map((el) =>
                el.id === elementId ? { ...el, ...updates } : el
              ),
            }
          : phase
      ),
    })),

  addElement: (phaseId, element) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId
          ? {
              ...phase,
              elements: [
                ...phase.elements,
                { ...element, id: generateId(), phaseId },
              ],
            }
          : phase
      ),
    })),

  deleteElement: (phaseId, elementId) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId
          ? {
              ...phase,
              elements: phase.elements.filter((el) => el.id !== elementId),
            }
          : phase
      ),
    })),

  updateMilestone: (phaseId, milestoneId, updates) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId
          ? {
              ...phase,
              milestones: phase.milestones.map((m) =>
                m.id === milestoneId ? { ...m, ...updates } : m
              ),
            }
          : phase
      ),
    })),

  addMilestone: (phaseId, milestone) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId
          ? {
              ...phase,
              milestones: [
                ...phase.milestones,
                { ...milestone, id: generateId(), parentId: phaseId, parentType: 'phase' as const },
              ],
            }
          : phase
      ),
    })),

  deleteMilestone: (phaseId, milestoneId) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId
          ? {
              ...phase,
              milestones: phase.milestones.filter((m) => m.id !== milestoneId),
            }
          : phase
      ),
    })),

  updatePhasePosition: (phaseId, relativeStart, relativeEnd) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId
          ? { ...phase, relativeStart, relativeEnd }
          : phase
      ),
    })),

  updateElementPosition: (phaseId, elementId, relativeStart, relativeEnd) =>
    set((state) => ({
      phases: state.phases.map((phase) =>
        phase.id === phaseId
          ? {
              ...phase,
              elements: phase.elements.map((el) =>
                el.id === elementId
                  ? { ...el, relativeStart, relativeEnd }
                  : el
              ),
            }
          : phase
      ),
    })),

  saveState: () => {
    const { phases } = get();
    const project = useProjectStore.getState().project;
    saveToStorage({
      project,
      phases,
      teams: [],
      version: 1,
    });
  },
}));
