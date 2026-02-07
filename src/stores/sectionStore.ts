import { create } from 'zustand';
import { temporal } from 'zundo';
import { parseISO, differenceInDays, addDays, subDays } from 'date-fns';
import type { Section, Phase, Task, Milestone, BarMilestone } from '../types';
import { createDefaultIDTimelineSection, createDefaultSectionDateRange } from '../data/defaultTemplate';
import { useProjectStore } from './projectStore';
import { useUIStore } from './uiStore';
import { getScheduleColor } from '../constants/colors';

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

  // Drag transaction state (for undo coalescing)
  _dragSnapshot: Section[] | null;
  _dragHistoryIndex: number | null;

  // Initialization
  initializeFromProject: () => Promise<void>;
  loadSectionsForProject: (projectId: string) => Promise<void>;
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
  toggleSectionLock: (sectionId: string) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;

  // Master operations
  setAsMaster: (sectionId: string) => void;
  isMaster: (sectionId: string) => boolean;
  incrementRevision: (sectionId: string) => void;

  // Phase operations
  addPhase: (sectionId: string, phase: Omit<Phase, 'id' | 'sectionId'>) => void;
  updatePhase: (sectionId: string, phaseId: string, updates: Partial<Phase>) => void;
  deletePhase: (sectionId: string, phaseId: string) => void;
  togglePhaseCollapse: (sectionId: string, phaseId: string) => void;
  togglePhaseLock: (sectionId: string, phaseId: string) => void;
  reorderPhases: (sectionId: string, fromIndex: number, toIndex: number) => void;
  updatePhasePosition: (
    sectionId: string,
    phaseId: string,
    relativeStart: number,
    relativeEnd: number
  ) => void;
  updatePhaseWithTasks: (
    sectionId: string,
    phaseId: string,
    relativeStart: number,
    relativeEnd: number,
    taskUpdates: Array<{ id: string; relativeStart: number; relativeEnd: number }>
  ) => void;
  updatePhaseWithRipple: (
    sectionId: string,
    phaseId: string,
    newRelativeEnd: number
  ) => void;

  // Task operations
  addTask: (
    sectionId: string,
    phaseId: string,
    task: Omit<Task, 'id' | 'phaseId'>
  ) => void;
  updateTask: (
    sectionId: string,
    phaseId: string,
    taskId: string,
    updates: Partial<Task>
  ) => void;
  deleteTask: (sectionId: string, phaseId: string, taskId: string) => void;
  updateTaskPosition: (
    sectionId: string,
    phaseId: string,
    taskId: string,
    relativeStart: number,
    relativeEnd: number
  ) => void;

  // Milestone operations
  addMilestone: (sectionId: string, milestone: Omit<Milestone, 'id' | 'sectionId'>) => void;
  updateMilestone: (sectionId: string, milestoneId: string, updates: Partial<Milestone>) => void;
  deleteMilestone: (sectionId: string, milestoneId: string) => void;

  // Phase bar milestone operations
  addPhaseBarMilestone: (sectionId: string, phaseId: string, barMilestone: Omit<BarMilestone, 'id'>) => string;
  updatePhaseBarMilestone: (sectionId: string, phaseId: string, barMilestoneId: string, updates: Partial<BarMilestone>) => void;
  deletePhaseBarMilestone: (sectionId: string, phaseId: string, barMilestoneId: string) => void;

  // Task bar milestone operations
  addTaskBarMilestone: (sectionId: string, phaseId: string, taskId: string, barMilestone: Omit<BarMilestone, 'id'>) => string;
  updateTaskBarMilestone: (sectionId: string, phaseId: string, taskId: string, barMilestoneId: string, updates: Partial<BarMilestone>) => void;
  deleteTaskBarMilestone: (sectionId: string, phaseId: string, taskId: string, barMilestoneId: string) => void;

  // Expansion tracking for viewport stability
  clearExpansion: () => void;

  // Save state
  saveState: () => void;

  // Drag transaction methods (for undo coalescing)
  beginDragTransaction: () => void;
  commitDragTransaction: () => void;
  rollbackDragTransaction: () => void;
}

// Selectors for O(1) lookups
export const selectSection = (sectionId: string) => (state: SectionState) =>
  state.sections.find((s) => s.id === sectionId);

export const selectPhase = (sectionId: string, phaseId: string) => (state: SectionState) => {
  const section = state.sections.find((s) => s.id === sectionId);
  return section?.phases.find((p) => p.id === phaseId);
};

export const selectTask =
  (sectionId: string, phaseId: string, taskId: string) => (state: SectionState) => {
    const section = state.sections.find((s) => s.id === sectionId);
    const phase = section?.phases.find((p) => p.id === phaseId);
    return phase?.tasks.find((t) => t.id === taskId);
  };

export const selectMilestone = (sectionId: string, milestoneId: string) => (state: SectionState) => {
  const section = state.sections.find((s) => s.id === sectionId);
  return section?.milestones.find((m) => m.id === milestoneId);
};

export const selectPhaseBarMilestone =
  (sectionId: string, phaseId: string, barMilestoneId: string) => (state: SectionState) => {
    const section = state.sections.find((s) => s.id === sectionId);
    const phase = section?.phases.find((p) => p.id === phaseId);
    return phase?.barMilestones?.find((bm) => bm.id === barMilestoneId);
  };

export const selectTaskBarMilestone =
  (sectionId: string, phaseId: string, taskId: string, barMilestoneId: string) => (state: SectionState) => {
    const section = state.sections.find((s) => s.id === sectionId);
    const phase = section?.phases.find((p) => p.id === phaseId);
    const task = phase?.tasks.find((t) => t.id === taskId);
    return task?.barMilestones?.find((bm) => bm.id === barMilestoneId);
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

export const useSectionStore = create<SectionState>()(
  temporal(
    (set, get) => ({
  sections: [],
  isInitialized: false,
  lastExpansion: null,
  _dragSnapshot: null,
  _dragHistoryIndex: null,

  initializeFromProject: async () => {
    const projectStore = useProjectStore.getState();
    await projectStore.initializeProjects();

    const activeProjectId = projectStore.activeProjectId;
    if (activeProjectId) {
      const data = await projectStore.loadProjectData(activeProjectId);
      if (data && data.sections && data.sections.length > 0) {
        set({
          sections: data.sections,
          isInitialized: true,
        });
        // Clear undo history after initialization so the loaded state is the base
        useSectionStore.temporal.getState().clear();
        return;
      }
    }

    // No project or no sections - start with empty state
    set({
      sections: [],
      isInitialized: true,
    });
    // Clear undo history after initialization
    useSectionStore.temporal.getState().clear();
  },

  loadSectionsForProject: async (projectId: string) => {
    if (!projectId) {
      set({ sections: [] });
      // Clear undo history when switching projects
      useSectionStore.temporal.getState().clear();
      return;
    }

    const projectStore = useProjectStore.getState();
    const data = await projectStore.loadProjectData(projectId);

    if (data && data.sections && data.sections.length > 0) {
      set({ sections: data.sections });
    } else {
      set({ sections: [createDefaultIDTimelineSection()] });
    }
    // Clear undo history when switching projects so the loaded state is the base
    useSectionStore.temporal.getState().clear();
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
      // Use master section's date range if available, otherwise use default
      const project = useProjectStore.getState().project;
      const masterSection = project?.masterSectionId
        ? state.sections.find((s) => s.id === project.masterSectionId)
        : null;
      const { startDate, endDate } = masterSection
        ? { startDate: masterSection.startDate, endDate: masterSection.endDate }
        : createDefaultSectionDateRange();

      const now = new Date().toISOString();
      const newSection: Section = {
        id: generateId(),
        type: 'schedule',
        name: name || '',
        templateId: undefined,
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

      // Update only the master section
      const updatedSections = state.sections.map((section) => {
        if (section.id === project.masterSectionId) {
          return {
            ...section,
            startDate,
            endDate,
            lastModifiedAt: now,
            revision: section.revision + 1,
          };
        }
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

  toggleSectionLock: (sectionId) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? { ...section, isLocked: !section.isLocked }
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
  },

  isMaster: (sectionId) => {
    const project = useProjectStore.getState().project;
    return project?.masterSectionId === sectionId;
  },

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

  togglePhaseLock: (sectionId, phaseId) =>
    set((state) => ({
      sections: state.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              phases: section.phases.map((phase) =>
                phase.id === phaseId
                  ? { ...phase, isLocked: !phase.isLocked }
                  : phase
              ),
            }
          : section
      ),
    })),

  reorderPhases: (sectionId, fromIndex, toIndex) =>
    set((state) => ({
      sections: state.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const phases = [...section.phases];
        const [removed] = phases.splice(fromIndex, 1);
        phases.splice(toIndex, 0, removed);
        // Update order values
        const reorderedPhases = phases.map((phase, index) => ({
          ...phase,
          order: index,
        }));
        return {
          ...section,
          phases: reorderedPhases,
          lastModifiedAt: new Date().toISOString(),
        };
      }),
    })),

  updatePhasePosition: (sectionId, phaseId, relativeStart, relativeEnd) =>
    set((state) => {
      const section = state.sections.find((s) => s.id === sectionId);
      if (!section) return state;

      const project = useProjectStore.getState().project;
      const isMasterSection = section.id === project?.masterSectionId;

      let finalStart = relativeStart;
      let finalEnd = relativeEnd;

      // Master section: clamp phases to [0, 1] - no auto-expansion allowed
      if (isMasterSection) {
        const phase = section.phases.find((p) => p.id === phaseId);
        if (phase) {
          // Detect if we're moving (both edges change) or resizing (one edge changes)
          const startDelta = Math.abs(relativeStart - phase.relativeStart);
          const endDelta = Math.abs(relativeEnd - phase.relativeEnd);
          const isMoving = startDelta > 0.0001 && endDelta > 0.0001;

          if (isMoving) {
            // Moving - maintain bar width, stop at edges
            const barWidth = relativeEnd - relativeStart;
            if (relativeEnd > 1) {
              finalEnd = 1;
              finalStart = Math.max(0, 1 - barWidth);
            } else if (relativeStart < 0) {
              finalStart = 0;
              finalEnd = Math.min(1, barWidth);
            }
          } else {
            // Resizing - just clamp the edge being dragged
            finalStart = Math.max(0, relativeStart);
            finalEnd = Math.min(1, relativeEnd);
          }
        } else {
          // Fallback: simple clamp
          finalStart = Math.max(0, relativeStart);
          finalEnd = Math.min(1, relativeEnd);
        }

        // Simple update for master - no expansion
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

      // Non-master section: allow auto-expansion
      const needsExpansion = relativeStart < 0 || relativeEnd > 1;

      if (!needsExpansion) {
        // Simple update - no expansion needed
        return {
          sections: state.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  phases: s.phases.map((phase) =>
                    phase.id === phaseId
                      ? { ...phase, relativeStart, relativeEnd }
                      : phase
                  ),
                  lastModifiedAt: new Date().toISOString(),
                  revision: s.revision + 1,
                }
              : s
          ),
        };
      }

      // Auto-expansion logic for non-master sections
      const sectionStart = parseISO(section.startDate);
      const sectionEnd = parseISO(section.endDate);
      const sectionDays = differenceInDays(sectionEnd, sectionStart);

      let newStartDate = sectionStart;
      let newEndDate = sectionEnd;
      let expansionStartDays = 0;
      let expansionEndDays = 0;

      if (relativeStart < 0) {
        const overflowDays = Math.abs(relativeStart) * sectionDays;
        expansionStartDays = Math.ceil(overflowDays);
        newStartDate = subDays(sectionStart, expansionStartDays);
      }

      if (relativeEnd > 1) {
        const overflowDays = (relativeEnd - 1) * sectionDays;
        expansionEndDays = Math.ceil(overflowDays);
        newEndDate = addDays(sectionEnd, expansionEndDays);
      }

      const newSectionDays = differenceInDays(newEndDate, newStartDate);
      const oldTotalDays = sectionDays;

      const oldSectionStartInNew = expansionStartDays / newSectionDays;
      const oldSectionScaleInNew = oldTotalDays / newSectionDays;

      const scalePosition = (oldRelative: number): number => {
        return oldSectionStartInNew + oldRelative * oldSectionScaleInNew;
      };

      const newPhaseStart = scalePosition(Math.max(0, relativeStart));
      const newPhaseEnd = scalePosition(Math.min(1, relativeEnd));

      let finalPhaseStart = newPhaseStart;
      let finalPhaseEnd = newPhaseEnd;

      if (relativeStart < 0) {
        const absoluteStartDays = relativeStart * oldTotalDays;
        finalPhaseStart = (expansionStartDays + absoluteStartDays) / newSectionDays;
      }

      if (relativeEnd > 1) {
        const absoluteEndDays = relativeEnd * oldTotalDays;
        finalPhaseEnd = (expansionStartDays + absoluteEndDays) / newSectionDays;
      }

      const newStartDateStr = newStartDate.toISOString();
      const newEndDateStr = newEndDate.toISOString();
      const now = new Date().toISOString();

      return {
        sections: state.sections.map((s) => {
          if (s.id === sectionId) {
            return {
              ...s,
              startDate: newStartDateStr,
              endDate: newEndDateStr,
              lastModifiedAt: now,
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
            };
          }
          return s;
        }),
        lastExpansion: {
          sectionId,
          expansionStartDays,
          expansionEndDays,
          oldTotalDays,
          newTotalDays: newSectionDays,
        },
      };
    }),

  updatePhaseWithTasks: (sectionId, phaseId, relativeStart, relativeEnd, taskUpdates) =>
    set((state) => {
      const section = state.sections.find((s) => s.id === sectionId);
      if (!section) return state;

      const project = useProjectStore.getState().project;
      const isMasterSection = section.id === project?.masterSectionId;

      let finalStart = relativeStart;
      let finalEnd = relativeEnd;

      // Master section: clamp phases to [0, 1]
      if (isMasterSection) {
        const phase = section.phases.find((p) => p.id === phaseId);
        if (phase) {
          const startDelta = Math.abs(relativeStart - phase.relativeStart);
          const endDelta = Math.abs(relativeEnd - phase.relativeEnd);
          const isMoving = startDelta > 0.0001 && endDelta > 0.0001;

          if (isMoving) {
            const barWidth = relativeEnd - relativeStart;
            if (relativeEnd > 1) {
              finalEnd = 1;
              finalStart = Math.max(0, 1 - barWidth);
            } else if (relativeStart < 0) {
              finalStart = 0;
              finalEnd = Math.min(1, barWidth);
            }
          } else {
            finalStart = Math.max(0, relativeStart);
            finalEnd = Math.min(1, relativeEnd);
          }
        } else {
          finalStart = Math.max(0, relativeStart);
          finalEnd = Math.min(1, relativeEnd);
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
                        tasks: phase.tasks.map((task) => {
                          const update = taskUpdates.find((u) => u.id === task.id);
                          return update
                            ? { ...task, relativeStart: update.relativeStart, relativeEnd: update.relativeEnd }
                            : task;
                        }),
                      }
                    : phase
                ),
              }
            : s
        ),
      };
    }),

  updatePhaseWithRipple: (sectionId, phaseId, newRelativeEnd) =>
    set((state) => {
      const section = state.sections.find((s) => s.id === sectionId);
      if (!section) return state;

      const phase = section.phases.find((p) => p.id === phaseId);
      if (!phase) return state;

      const project = useProjectStore.getState().project;
      const isMasterSection = section.id === project?.masterSectionId;

      // Calculate delta from current end to new end
      const delta = newRelativeEnd - phase.relativeEnd;
      if (Math.abs(delta) < 0.0001) return state; // No meaningful change

      // For master section, clamp the new end to 1
      const clampedNewEnd = isMasterSection ? Math.min(1, newRelativeEnd) : newRelativeEnd;
      const actualDelta = clampedNewEnd - phase.relativeEnd;

      // Find phases that start at or after the current phase's end (downstream phases)
      const downstreamPhases = section.phases.filter(
        (p) => p.id !== phaseId && p.relativeStart >= phase.relativeEnd - 0.0001
      );

      // Find milestones that are at or after the current phase's end
      const downstreamMilestones = section.milestones.filter(
        (m) => m.relativePosition >= phase.relativeEnd - 0.0001
      );

      // For master section, check if ripple would push anything past 1
      if (isMasterSection) {
        const maxDownstreamEnd = Math.max(
          ...downstreamPhases.map((p) => p.relativeEnd),
          ...downstreamMilestones.map((m) => m.relativePosition),
          0
        );
        if (maxDownstreamEnd + actualDelta > 1) {
          // Reduce delta to prevent overflow
          const allowedDelta = Math.max(0, 1 - maxDownstreamEnd);
          if (allowedDelta < 0.0001) return state; // Can't ripple further
        }
      }

      const now = new Date().toISOString();

      return {
        sections: state.sections.map((s) => {
          if (s.id !== sectionId) return s;

          return {
            ...s,
            lastModifiedAt: now,
            revision: s.revision + 1,
            phases: s.phases.map((p) => {
              if (p.id === phaseId) {
                // Update the dragged phase's end
                return { ...p, relativeEnd: clampedNewEnd };
              }
              if (downstreamPhases.some((dp) => dp.id === p.id)) {
                // Shift downstream phases by delta
                return {
                  ...p,
                  relativeStart: p.relativeStart + actualDelta,
                  relativeEnd: p.relativeEnd + actualDelta,
                };
              }
              return p;
            }),
            milestones: s.milestones.map((m) => {
              if (downstreamMilestones.some((dm) => dm.id === m.id)) {
                // Shift downstream milestones by delta
                return {
                  ...m,
                  relativePosition: m.relativePosition + actualDelta,
                };
              }
              return m;
            }),
          };
        }),
      };
    }),

  addTask: (sectionId, phaseId, task) =>
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
                      tasks: [
                        ...phase.tasks,
                        { ...task, id: generateId(), phaseId },
                      ],
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  updateTask: (sectionId, phaseId, taskId, updates) =>
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
                      tasks: phase.tasks.map((task) =>
                        task.id === taskId ? { ...task, ...updates } : task
                      ),
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  deleteTask: (sectionId, phaseId, taskId) =>
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
                      tasks: phase.tasks.filter((task) => task.id !== taskId),
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  updateTaskPosition: (sectionId, phaseId, taskId, relativeStart, relativeEnd) =>
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
                      tasks: phase.tasks.map((task) =>
                        task.id === taskId
                          ? { ...task, relativeStart, relativeEnd }
                          : task
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

  // Phase bar milestone operations
  addPhaseBarMilestone: (sectionId, phaseId, barMilestone) => {
    const newId = generateId();
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
                      barMilestones: [...(phase.barMilestones || []), { ...barMilestone, id: newId }],
                    }
                  : phase
              ),
            }
          : section
      ),
    }));
    return newId;
  },

  updatePhaseBarMilestone: (sectionId, phaseId, barMilestoneId, updates) =>
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
                      barMilestones: (phase.barMilestones || []).map((bm) =>
                        bm.id === barMilestoneId ? { ...bm, ...updates } : bm
                      ),
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  deletePhaseBarMilestone: (sectionId, phaseId, barMilestoneId) =>
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
                      barMilestones: (phase.barMilestones || []).filter((bm) => bm.id !== barMilestoneId),
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  // Task bar milestone operations
  addTaskBarMilestone: (sectionId, phaseId, taskId, barMilestone) => {
    const newId = generateId();
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
                      tasks: phase.tasks.map((task) =>
                        task.id === taskId
                          ? {
                              ...task,
                              barMilestones: [...(task.barMilestones || []), { ...barMilestone, id: newId }],
                            }
                          : task
                      ),
                    }
                  : phase
              ),
            }
          : section
      ),
    }));
    return newId;
  },

  updateTaskBarMilestone: (sectionId, phaseId, taskId, barMilestoneId, updates) =>
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
                      tasks: phase.tasks.map((task) =>
                        task.id === taskId
                          ? {
                              ...task,
                              barMilestones: (task.barMilestones || []).map((bm) =>
                                bm.id === barMilestoneId ? { ...bm, ...updates } : bm
                              ),
                            }
                          : task
                      ),
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  deleteTaskBarMilestone: (sectionId, phaseId, taskId, barMilestoneId) =>
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
                      tasks: phase.tasks.map((task) =>
                        task.id === taskId
                          ? {
                              ...task,
                              barMilestones: (task.barMilestones || []).filter((bm) => bm.id !== barMilestoneId),
                            }
                          : task
                      ),
                    }
                  : phase
              ),
            }
          : section
      ),
    })),

  clearExpansion: () => set({ lastExpansion: null }),

  saveState: () => {
    const { sections } = get();
    useProjectStore.getState().saveCurrentProject(sections);
  },

  beginDragTransaction: () => {
    const { pastStates } = useSectionStore.temporal.getState();
    const currentSections = get().sections;

    // Save snapshot and history index before any drag changes
    // We DON'T pause - let all intermediate states be recorded
    // They'll be collapsed at commit time
    set({
      _dragSnapshot: structuredClone(currentSections),
      _dragHistoryIndex: pastStates.length,
    });
  },

  commitDragTransaction: () => {
    const snapshot = get()._dragSnapshot;
    const historyIndex = get()._dragHistoryIndex;
    const currentSections = get().sections;

    // Clear transaction state
    set({ _dragSnapshot: null, _dragHistoryIndex: null });

    // If no snapshot or index, nothing to do
    if (snapshot === null || historyIndex === null) return;

    // If no changes were made, just remove any intermediate history entries
    const changed = JSON.stringify(snapshot) !== JSON.stringify(currentSections);
    if (!changed) {
      const { pastStates } = useSectionStore.temporal.getState();
      // Remove any entries added during the drag (there shouldn't be any if unchanged)
      if (pastStates.length > historyIndex) {
        useSectionStore.temporal.setState({
          pastStates: pastStates.slice(0, historyIndex),
        });
      }
      return;
    }

    // Get current history
    const { pastStates } = useSectionStore.temporal.getState();

    // Remove all entries added during the drag, replace with just the pre-drag snapshot
    // This collapses: [history..., drag1, drag2, drag3] -> [history..., snapshot]
    const originalHistory = pastStates.slice(0, historyIndex);

    useSectionStore.temporal.setState({
      pastStates: [...originalHistory, { sections: snapshot }],
      futureStates: [], // Clear redo since this is a new action
    });
  },

  rollbackDragTransaction: () => {
    const snapshot = get()._dragSnapshot;
    const historyIndex = get()._dragHistoryIndex;

    // Restore to snapshot if available
    if (snapshot && historyIndex !== null) {
      const { pastStates } = useSectionStore.temporal.getState();
      // Remove any entries added during the drag
      useSectionStore.temporal.setState({
        pastStates: pastStates.slice(0, historyIndex),
      });
      set({ sections: snapshot, _dragSnapshot: null, _dragHistoryIndex: null });
    } else {
      set({ _dragSnapshot: null, _dragHistoryIndex: null });
    }
  },
    }),
    {
      limit: 50,
      partialize: (state) => ({ sections: state.sections }),
    }
  )
);
