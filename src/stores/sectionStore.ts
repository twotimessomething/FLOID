import { create } from 'zustand';
import type { Section, Phase, Element, Milestone } from '../types';
import { createDefaultIDTimelineSection } from '../data/defaultTemplate';
import { useProjectStore } from './projectStore';
import { getTeamColor } from '../constants/colors';

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

interface SectionState {
  sections: Section[];
  isInitialized: boolean;

  // Initialization
  initializeFromProject: () => void;
  loadSectionsForProject: (projectId: string) => void;

  // Section operations
  setSections: (sections: Section[]) => void;
  addSection: (name: string) => void;
  updateSection: (sectionId: string, updates: Partial<Omit<Section, 'id' | 'type'>>) => void;
  deleteSection: (sectionId: string) => void;
  toggleSectionCollapse: (sectionId: string) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;

  // Phase operations
  addPhase: (sectionId: string, phase: Omit<Phase, 'id' | 'sectionId'>) => void;
  updatePhase: (sectionId: string, phaseId: string, updates: Partial<Phase>) => void;
  deletePhase: (sectionId: string, phaseId: string) => void;
  togglePhaseCollapse: (sectionId: string, phaseId: string) => void;
  updatePhasePosition: (
    sectionId: string,
    phaseId: string,
    relativeStart: number,
    relativeEnd: number
  ) => void;
  updatePhaseWithElements: (
    sectionId: string,
    phaseId: string,
    relativeStart: number,
    relativeEnd: number,
    elementUpdates: Array<{ id: string; relativeStart: number; relativeEnd: number }>
  ) => void;

  // Element operations
  addElement: (
    sectionId: string,
    phaseId: string,
    element: Omit<Element, 'id' | 'phaseId'>
  ) => void;
  updateElement: (
    sectionId: string,
    phaseId: string,
    elementId: string,
    updates: Partial<Element>
  ) => void;
  deleteElement: (sectionId: string, phaseId: string, elementId: string) => void;
  updateElementPosition: (
    sectionId: string,
    phaseId: string,
    elementId: string,
    relativeStart: number,
    relativeEnd: number
  ) => void;

  // Milestone operations
  addMilestone: (sectionId: string, milestone: Omit<Milestone, 'id' | 'sectionId'>) => void;
  updateMilestone: (sectionId: string, milestoneId: string, updates: Partial<Milestone>) => void;
  deleteMilestone: (sectionId: string, milestoneId: string) => void;

  // Save state
  saveState: () => void;
}

// Selectors for O(1) lookups
export const selectSection = (sectionId: string) => (state: SectionState) =>
  state.sections.find((s) => s.id === sectionId);

export const selectPhase = (sectionId: string, phaseId: string) => (state: SectionState) => {
  const section = state.sections.find((s) => s.id === sectionId);
  return section?.phases.find((p) => p.id === phaseId);
};

export const selectElement =
  (sectionId: string, phaseId: string, elementId: string) => (state: SectionState) => {
    const section = state.sections.find((s) => s.id === sectionId);
    const phase = section?.phases.find((p) => p.id === phaseId);
    return phase?.elements.find((e) => e.id === elementId);
  };

export const selectMilestone = (sectionId: string, milestoneId: string) => (state: SectionState) => {
  const section = state.sections.find((s) => s.id === sectionId);
  return section?.milestones.find((m) => m.id === milestoneId);
};

export const selectIDTimeline = (state: SectionState) =>
  state.sections.find((s) => s.type === 'id-timeline');

export const selectTeams = (state: SectionState) =>
  state.sections.filter((s) => s.type === 'team');

export const useSectionStore = create<SectionState>((set, get) => ({
  sections: [],
  isInitialized: false,

  initializeFromProject: () => {
    const projectStore = useProjectStore.getState();
    projectStore.initializeProjects();

    const activeProjectId = projectStore.activeProjectId;
    if (activeProjectId) {
      const data = projectStore.loadProjectData(activeProjectId);
      if (data && data.sections && data.sections.length > 0) {
        set({
          sections: data.sections,
          isInitialized: true,
        });
        return;
      }
    }

    // Fallback to default template
    set({
      sections: [createDefaultIDTimelineSection()],
      isInitialized: true,
    });
  },

  loadSectionsForProject: (projectId: string) => {
    const projectStore = useProjectStore.getState();
    const data = projectStore.loadProjectData(projectId);

    if (data && data.sections && data.sections.length > 0) {
      set({ sections: data.sections });
    } else {
      set({ sections: [createDefaultIDTimelineSection()] });
    }
  },

  setSections: (sections) => set({ sections }),

  addSection: (name) =>
    set((state) => {
      const teamCount = state.sections.filter((s) => s.type === 'team').length;
      const newSection: Section = {
        id: generateId(),
        type: 'team',
        name: name || '',
        color: getTeamColor(teamCount),
        order: state.sections.length,
        isCollapsed: false,
        phases: [],
        milestones: [],
      };
      return { sections: [...state.sections, newSection] };
    }),

  updateSection: (sectionId, updates) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId ? { ...section, ...updates } : section
      ),
    })),

  deleteSection: (sectionId) =>
    set((state) => {
      // Prevent deleting the ID timeline
      const section = state.sections.find((s) => s.id === sectionId);
      if (!section || section.type === 'id-timeline') {
        return state;
      }
      return {
        sections: state.sections.filter((s) => s.id !== sectionId),
      };
    }),

  toggleSectionCollapse: (sectionId) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? { ...section, isCollapsed: !section.isCollapsed }
          : section
      ),
    })),

  reorderSections: (fromIndex, toIndex) =>
    set((state) => {
      // Adjust indices to skip ID timeline at index 0
      const idTimeline = state.sections.find((s) => s.type === 'id-timeline');
      const teams = state.sections.filter((s) => s.type === 'team');

      const actualFromIndex = fromIndex;
      const actualToIndex = toIndex;

      const reorderedTeams = [...teams];
      const [removed] = reorderedTeams.splice(actualFromIndex, 1);
      reorderedTeams.splice(actualToIndex, 0, removed);

      // Rebuild sections with ID timeline first
      const newSections = idTimeline
        ? [idTimeline, ...reorderedTeams.map((team, index) => ({ ...team, order: index + 1 }))]
        : reorderedTeams.map((team, index) => ({ ...team, order: index }));

      return { sections: newSections };
    }),

  addPhase: (sectionId, phase) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: [
                ...section.phases,
                { ...phase, id: generateId(), sectionId },
              ],
            }
          : section
      ),
    })),

  updatePhase: (sectionId, phaseId, updates) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.map((phase) =>
                phase.id === phaseId ? { ...phase, ...updates } : phase
              ),
            }
          : section
      ),
    })),

  deletePhase: (sectionId, phaseId) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.filter((phase) => phase.id !== phaseId),
            }
          : section
      ),
    })),

  togglePhaseCollapse: (sectionId, phaseId) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.map((phase) =>
                phase.id === phaseId
                  ? { ...phase, isCollapsed: !phase.isCollapsed }
                  : phase
              ),
            }
          : section
      ),
    })),

  updatePhasePosition: (sectionId, phaseId, relativeStart, relativeEnd) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.map((phase) =>
                phase.id === phaseId
                  ? { ...phase, relativeStart, relativeEnd }
                  : phase
              ),
            }
          : section
      ),
    })),

  updatePhaseWithElements: (sectionId, phaseId, relativeStart, relativeEnd, elementUpdates) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      relativeStart,
                      relativeEnd,
                      elements: phase.elements.map((el) => {
                        const update = elementUpdates.find((u) => u.id === el.id);
                        return update
                          ? { ...el, relativeStart: update.relativeStart, relativeEnd: update.relativeEnd }
                          : el;
                      }),
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  addElement: (sectionId, phaseId, element) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.map((phase) =>
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
            }
          : section
      ),
    })),

  updateElement: (sectionId, phaseId, elementId, updates) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      elements: phase.elements.map((el) =>
                        el.id === elementId ? { ...el, ...updates } : el
                      ),
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  deleteElement: (sectionId, phaseId, elementId) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.map((phase) =>
                phase.id === phaseId
                  ? {
                      ...phase,
                      elements: phase.elements.filter((el) => el.id !== elementId),
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  updateElementPosition: (sectionId, phaseId, elementId, relativeStart, relativeEnd) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.map((phase) =>
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
            }
          : section
      ),
    })),

  addMilestone: (sectionId, milestone) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              milestones: [
                ...section.milestones,
                { ...milestone, id: generateId(), sectionId },
              ],
            }
          : section
      ),
    })),

  updateMilestone: (sectionId, milestoneId, updates) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              milestones: section.milestones.map((m) =>
                m.id === milestoneId ? { ...m, ...updates } : m
              ),
            }
          : section
      ),
    })),

  deleteMilestone: (sectionId, milestoneId) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              milestones: section.milestones.filter((m) => m.id !== milestoneId),
            }
          : section
      ),
    })),

  saveState: () => {
    const { sections } = get();
    useProjectStore.getState().saveCurrentProject(sections);
  },
}));
