import { create } from 'zustand';
import type { Phase, Element, Milestone } from '../types';
import { createDefaultPhases, createDefaultMilestones } from '../data/defaultTemplate';
import { useProjectStore } from './projectStore';
import { useTeamStore } from './teamStore';

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

interface TimelineState {
  phases: Phase[];
  milestones: Milestone[]; // ID timeline milestones (phase-agnostic)
  isInitialized: boolean;

  // Initialization
  initializeFromProject: () => void;
  loadPhasesForProject: (projectId: string) => void;

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

  // Milestone operations (now at timeline level, not phase level)
  setMilestones: (milestones: Milestone[]) => void;
  updateMilestone: (milestoneId: string, updates: Partial<Milestone>) => void;
  addMilestone: (milestone: Omit<Milestone, 'id'>) => void;
  deleteMilestone: (milestoneId: string) => void;

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
  milestones: [],
  isInitialized: false,

  initializeFromProject: () => {
    const projectStore = useProjectStore.getState();
    projectStore.initializeProjects();

    const activeProjectId = projectStore.activeProjectId;
    if (activeProjectId) {
      const data = projectStore.loadProjectData(activeProjectId);
      if (data && data.phases.length > 0) {
        set({
          phases: data.phases,
          milestones: data.milestones || [],
          isInitialized: true,
        });
        return;
      }
    }

    // Fallback to default template
    set({
      phases: createDefaultPhases(),
      milestones: createDefaultMilestones(),
      isInitialized: true,
    });
  },

  loadPhasesForProject: (projectId: string) => {
    const projectStore = useProjectStore.getState();
    const data = projectStore.loadProjectData(projectId);

    if (data) {
      set({ phases: data.phases, milestones: data.milestones || [] });
    } else {
      set({ phases: createDefaultPhases(), milestones: createDefaultMilestones() });
    }
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

  setMilestones: (milestones) => set({ milestones }),

  updateMilestone: (milestoneId, updates) =>
    set((state) => ({
      milestones: state.milestones.map((m) =>
        m.id === milestoneId ? { ...m, ...updates } : m
      ),
    })),

  addMilestone: (milestone) =>
    set((state) => ({
      milestones: [
        ...state.milestones,
        { ...milestone, id: generateId() },
      ],
    })),

  deleteMilestone: (milestoneId) =>
    set((state) => ({
      milestones: state.milestones.filter((m) => m.id !== milestoneId),
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
    const { phases, milestones } = get();
    const teams = useTeamStore.getState().teams;
    useProjectStore.getState().saveCurrentProject(phases, milestones, teams);
  },
}));
