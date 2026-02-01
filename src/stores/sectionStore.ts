import { create } from 'zustand';
import { parseISO, differenceInDays, addDays, subDays } from 'date-fns';
import type { Section, Phase, Element, Milestone } from '../types';
import { createDefaultIDTimelineSection, createDefaultSectionDateRange } from '../data/defaultTemplate';
import { useProjectStore } from './projectStore';
import { useUIStore } from './uiStore';
import { getScheduleColor } from '../constants/colors';
import { rescalePhases, rescaleMilestones } from '../utils/dateUtils';

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

// Tracks auto-expansion for scroll compensation
export interface ExpansionInfo {
  sectionId: string;
  expansionStartDays: number;
  expansionEndDays: number;
  oldTotalDays: number;
  newTotalDays: number;
}

interface SectionState {
  sections: Section[];
  isInitialized: boolean;
  lastExpansion: ExpansionInfo | null;

  // Initialization
  initializeFromProject: () => void;
  loadSectionsForProject: (projectId: string) => void;
  clearSections: () => void;

  // Section operations
  setSections: (sections: Section[]) => void;
  addSection: (name: string) => void;
  addCompleteSection: (section: Section) => void;
  updateSection: (sectionId: string, updates: Partial<Omit<Section, 'id' | 'type'>>) => void;
  updateSectionDates: (sectionId: string, startDate: string, endDate: string) => void;
  updateMasterDates: (startDate: string, endDate: string) => void;
  deleteSection: (sectionId: string) => void;
  toggleSectionCollapse: (sectionId: string) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;

  // Master operations
  setAsMaster: (sectionId: string) => void;
  isMaster: (sectionId: string) => boolean;
  setBindingMode: (sectionId: string, mode: 'locked' | 'independent') => void;
  incrementRevision: (sectionId: string) => void;

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

  // Expansion tracking for viewport stability
  clearExpansion: () => void;

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

// Select master section (section whose ID matches project.masterSectionId)
export const selectMasterSection = (state: SectionState) => {
  const project = useProjectStore.getState().project;
  return state.sections.find((s) => s.id === project?.masterSectionId);
};

// Select all non-master sections
export const selectNonMasterSections = (state: SectionState) => {
  const project = useProjectStore.getState().project;
  return state.sections.filter((s) => s.id !== project?.masterSectionId);
};

export const useSectionStore = create<SectionState>((set, get) => ({
  sections: [],
  isInitialized: false,
  lastExpansion: null,

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

    // No project or no sections - start with empty state
    set({
      sections: [],
      isInitialized: true,
    });
  },

  loadSectionsForProject: (projectId: string) => {
    if (!projectId) {
      set({ sections: [] });
      return;
    }

    const projectStore = useProjectStore.getState();
    const data = projectStore.loadProjectData(projectId);

    if (data && data.sections && data.sections.length > 0) {
      set({ sections: data.sections });
    } else {
      set({ sections: [createDefaultIDTimelineSection()] });
    }
  },

  setSections: (sections) => set({ sections }),

  clearSections: () => set({ sections: [] }),

  addCompleteSection: (section) =>
    set((state) => ({
      sections: [...state.sections, section],
    })),

  addSection: (name) =>
    set((state) => {
      const sectionCount = state.sections.length;
      // Use first section's date range if available, otherwise use default
      const firstSection = state.sections[0];
      const { startDate, endDate } = firstSection
        ? { startDate: firstSection.startDate, endDate: firstSection.endDate }
        : createDefaultSectionDateRange();

      const now = new Date().toISOString();
      const newSection: Section = {
        id: generateId(),
        type: 'schedule',
        name: name || '',
        templateId: undefined,
        bindingMode: 'independent',
        revision: 1,
        lastModifiedAt: now,
        color: getScheduleColor(sectionCount),
        order: state.sections.length,
        isCollapsed: false,
        phases: [],
        milestones: [],
        startDate,
        endDate,
      };
      return { sections: [...state.sections, newSection] };
    }),

  updateSection: (sectionId, updates) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? { ...section, ...updates, lastModifiedAt: new Date().toISOString(), revision: section.revision + 1 }
          : section
      ),
    })),

  updateSectionDates: (sectionId, startDate, endDate) => {
    const project = useProjectStore.getState().project;
    const isMaster = project?.masterSectionId === sectionId;

    if (isMaster) {
      // Use updateMasterDates for master section to cascade changes
      get().updateMasterDates(startDate, endDate);
    } else {
      set((state) => ({
        sections: state.sections.map((section) =>
          section.id === sectionId
            ? { ...section, startDate, endDate, lastModifiedAt: new Date().toISOString(), revision: section.revision + 1 }
            : section
        ),
      }));
    }
  },

  updateMasterDates: (startDate, endDate) =>
    set((state) => {
      const project = useProjectStore.getState().project;
      if (!project) return state;

      const masterSection = state.sections.find((s) => s.id === project.masterSectionId);
      if (!masterSection) return state;

      const now = new Date().toISOString();

      // Update project dates
      useProjectStore.getState().updateProjectDates(startDate, endDate);

      // Update all sections: master gets new dates, locked sections sync and rescale content
      const updatedSections = state.sections.map((section) => {
        if (section.id === project.masterSectionId) {
          // Update master section
          return {
            ...section,
            startDate,
            endDate,
            lastModifiedAt: now,
            revision: section.revision + 1,
          };
        }

        if (section.bindingMode === 'locked') {
          // Sync locked sections - rescale content to fit new date range
          const rescaledPhases = rescalePhases(
            section.phases,
            section.startDate,
            section.endDate,
            startDate,
            endDate
          );
          const rescaledMilestones = rescaleMilestones(
            section.milestones,
            section.startDate,
            section.endDate,
            startDate,
            endDate
          );

          return {
            ...section,
            startDate,
            endDate,
            phases: rescaledPhases,
            milestones: rescaledMilestones,
            lastModifiedAt: now,
            revision: section.revision + 1,
          };
        }

        // Independent sections remain unchanged
        return section;
      });

      return { sections: updatedSections };
    }),

  deleteSection: (sectionId) => {
    const project = useProjectStore.getState().project;
    const state = get();

    // Prevent deleting the master section
    if (project && project.masterSectionId === sectionId) {
      const { showToast } = useUIStore.getState();
      showToast('warning', 'Cannot delete master schedule. Pin another schedule as master first.');
      return;
    }

    // Prevent deleting if only one section
    if (state.sections.length <= 1) {
      const { showToast } = useUIStore.getState();
      showToast('warning', 'Cannot delete the only schedule.');
      return;
    }

    set({
      sections: state.sections.filter((s) => s.id !== sectionId),
    });
  },

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
      const sections = [...state.sections];
      const [removed] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, removed);

      // Update order values
      const reorderedSections = sections.map((section, index) => ({
        ...section,
        order: index,
      }));

      return { sections: reorderedSections };
    }),

  setAsMaster: (sectionId) => {
    const { sections } = get();
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    // Update project's master section and dates
    useProjectStore.getState().setMasterSection(
      sectionId,
      section.startDate,
      section.endDate
    );

    // Update the section's binding mode to locked (master is always locked)
    set((state) => ({
      sections: state.sections.map((s) =>
        s.id === sectionId
          ? { ...s, bindingMode: 'locked' as const, lastModifiedAt: new Date().toISOString() }
          : s
      ),
    }));
  },

  isMaster: (sectionId) => {
    const project = useProjectStore.getState().project;
    return project?.masterSectionId === sectionId;
  },

  setBindingMode: (sectionId, mode) =>
    set((state) => {
      const project = useProjectStore.getState().project;
      if (!project) return state;

      const section = state.sections.find((s) => s.id === sectionId);
      if (!section) return state;

      const now = new Date().toISOString();

      // If switching to locked, sync dates to master
      if (mode === 'locked' && section.bindingMode === 'independent') {
        const masterStartDate = project.projectStartDate;
        const masterEndDate = project.projectEndDate;

        // Rescale content to fit master date range
        const rescaledPhases = rescalePhases(
          section.phases,
          section.startDate,
          section.endDate,
          masterStartDate,
          masterEndDate
        );
        const rescaledMilestones = rescaleMilestones(
          section.milestones,
          section.startDate,
          section.endDate,
          masterStartDate,
          masterEndDate
        );

        return {
          sections: state.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  bindingMode: mode,
                  startDate: masterStartDate,
                  endDate: masterEndDate,
                  phases: rescaledPhases,
                  milestones: rescaledMilestones,
                  lastModifiedAt: now,
                  revision: s.revision + 1,
                }
              : s
          ),
        };
      }

      // If switching to independent, just update the mode (dates stay the same)
      return {
        sections: state.sections.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                bindingMode: mode,
                lastModifiedAt: now,
                revision: s.revision + 1,
              }
            : s
        ),
      };
    }),

  incrementRevision: (sectionId) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              revision: section.revision + 1,
              lastModifiedAt: new Date().toISOString(),
            }
          : section
      ),
    })),

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
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
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
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
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
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
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
    set((state) => {
      const section = state.sections.find((s) => s.id === sectionId);
      if (!section) return state;

      // Locked sections (that aren't the master) cannot expand past their bounds
      const project = useProjectStore.getState().project;
      const isLockedNonMaster =
        section.bindingMode === 'locked' && section.id !== project?.masterSectionId;

      // If locked, clamp positions to [0, 1]
      let finalStart = relativeStart;
      let finalEnd = relativeEnd;

      if (isLockedNonMaster) {
        const barWidth = relativeEnd - relativeStart;
        finalStart = Math.max(0, Math.min(1 - barWidth, relativeStart));
        finalEnd = Math.min(1, Math.max(barWidth, relativeEnd));
        // Ensure we maintain bar width when clamped
        if (finalStart === 0) {
          finalEnd = Math.min(1, barWidth);
        }
        if (finalEnd === 1) {
          finalStart = Math.max(0, 1 - barWidth);
        }
      }

      // Check if expansion is needed
      const needsExpansion = finalStart < 0 || finalEnd > 1;

      if (!needsExpansion) {
        // Simple update - no expansion needed
        return {
          sections: state.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  phases: s.phases.map((phase) =>
                    phase.id === phaseId
                      ? { ...phase, relativeStart: finalStart, relativeEnd: finalEnd }
                      : phase
                  ),
                  lastModifiedAt: new Date().toISOString(),
                  revision: s.revision + 1,
                }
              : s
          ),
        };
      }

      // Auto-expansion logic
      const sectionStart = parseISO(section.startDate);
      const sectionEnd = parseISO(section.endDate);
      const sectionDays = differenceInDays(sectionEnd, sectionStart);

      // Calculate how much to expand by (30 days minimum, or the overflow amount)
      const EXPANSION_DAYS = 30;
      let newStartDate = sectionStart;
      let newEndDate = sectionEnd;
      let expansionStartDays = 0;
      let expansionEndDays = 0;

      if (relativeStart < 0) {
        // Expand left: convert relative overflow to days
        const overflowDays = Math.abs(relativeStart) * sectionDays;
        expansionStartDays = Math.max(EXPANSION_DAYS, Math.ceil(overflowDays));
        newStartDate = subDays(sectionStart, expansionStartDays);
      }

      if (relativeEnd > 1) {
        // Expand right: convert relative overflow to days
        const overflowDays = (relativeEnd - 1) * sectionDays;
        expansionEndDays = Math.max(EXPANSION_DAYS, Math.ceil(overflowDays));
        newEndDate = addDays(sectionEnd, expansionEndDays);
      }

      // Calculate new total days and scaling factors
      const newSectionDays = differenceInDays(newEndDate, newStartDate);
      const oldTotalDays = sectionDays;

      // All existing positions need to be scaled to the new section bounds
      // Old position was relative to [sectionStart, sectionEnd]
      // New position should be relative to [newStartDate, newEndDate]
      // The old section now occupies [expansionStartDays/newSectionDays, (expansionStartDays + oldTotalDays)/newSectionDays]
      const oldSectionStartInNew = expansionStartDays / newSectionDays;
      const oldSectionScaleInNew = oldTotalDays / newSectionDays;

      const scalePosition = (oldRelative: number): number => {
        // Convert old relative position to new section coordinates
        return oldSectionStartInNew + oldRelative * oldSectionScaleInNew;
      };

      // The phase being dragged gets its new position scaled too
      const newPhaseStart = scalePosition(Math.max(0, relativeStart));
      const newPhaseEnd = scalePosition(Math.min(1, relativeEnd));

      // If the drag went past bounds, we need to calculate actual positions
      let finalPhaseStart = newPhaseStart;
      let finalPhaseEnd = newPhaseEnd;

      if (relativeStart < 0) {
        // Phase start should be at the new section start
        const absoluteStartDays = relativeStart * oldTotalDays; // negative days from old start
        finalPhaseStart = (expansionStartDays + absoluteStartDays) / newSectionDays;
      }

      if (relativeEnd > 1) {
        // Phase end should extend into the expanded area
        const absoluteEndDays = relativeEnd * oldTotalDays; // days from old start, past old end
        finalPhaseEnd = (expansionStartDays + absoluteEndDays) / newSectionDays;
      }

      return {
        sections: state.sections.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                startDate: newStartDate.toISOString(),
                endDate: newEndDate.toISOString(),
                lastModifiedAt: new Date().toISOString(),
                revision: s.revision + 1,
                phases: s.phases.map((phase) =>
                  phase.id === phaseId
                    ? {
                        ...phase,
                        relativeStart: Math.max(0, finalPhaseStart),
                        relativeEnd: Math.min(1, finalPhaseEnd),
                      }
                    : {
                        ...phase,
                        relativeStart: scalePosition(phase.relativeStart),
                        relativeEnd: scalePosition(phase.relativeEnd),
                      }
                ),
                milestones: s.milestones.map((m) => ({
                  ...m,
                  relativePosition: scalePosition(m.relativePosition),
                })),
              }
            : s
        ),
        // Track expansion for scroll compensation
        lastExpansion: {
          sectionId,
          expansionStartDays,
          expansionEndDays,
          oldTotalDays,
          newTotalDays: newSectionDays,
        },
      };
    }),

  updatePhaseWithElements: (sectionId, phaseId, relativeStart, relativeEnd, elementUpdates) =>
    set((state) => {
      const section = state.sections.find((s) => s.id === sectionId);
      if (!section) return state;

      // Locked sections (that aren't the master) cannot expand past their bounds
      const project = useProjectStore.getState().project;
      const isLockedNonMaster =
        section.bindingMode === 'locked' && section.id !== project?.masterSectionId;

      let finalStart = relativeStart;
      let finalEnd = relativeEnd;

      if (isLockedNonMaster) {
        const barWidth = relativeEnd - relativeStart;
        finalStart = Math.max(0, Math.min(1 - barWidth, relativeStart));
        finalEnd = Math.min(1, Math.max(barWidth, relativeEnd));
        if (finalStart === 0) {
          finalEnd = Math.min(1, barWidth);
        }
        if (finalEnd === 1) {
          finalStart = Math.max(0, 1 - barWidth);
        }
      }

      return {
        sections: state.sections.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                lastModifiedAt: new Date().toISOString(),
                revision: s.revision + 1,
                phases: s.phases.map((phase) =>
                  phase.id === phaseId
                    ? {
                        ...phase,
                        relativeStart: finalStart,
                        relativeEnd: finalEnd,
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
            : s
        ),
      };
    }),

  addElement: (sectionId, phaseId, element) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
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
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
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
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
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
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
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
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
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
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
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
              lastModifiedAt: new Date().toISOString(),
              revision: section.revision + 1,
              milestones: section.milestones.filter((m) => m.id !== milestoneId),
            }
          : section
      ),
    })),

  clearExpansion: () => set({ lastExpansion: null }),

  saveState: () => {
    const { sections } = get();
    useProjectStore.getState().saveCurrentProject(sections);
  },
}));
