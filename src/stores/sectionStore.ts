import { create } from 'zustand';
import { temporal } from 'zundo';
import type { DependencyAnchor, DependencyEdge, Section, TimelineItem } from '../types/timeline';
import { createDefaultIDTimelineSection } from '../data/defaultTemplate';
import { useProjectStore } from './projectStore';
import { getScheduleColor } from '../constants/colors';
import { generateId } from '../utils/idUtils';
import { addDaysToKey, dayKeyDiff, maxDayKey, minDayKey } from '../utils/dayKeys';
import { createDefaultWindow } from '../utils/migrateLegacy';
import {
  collectIds,
  findItem,
  findItemPath,
  forEachItem,
  insertItemInto,
  isWithin,
  locateItem,
  removeItemFrom,
  sectionsExtent,
  shiftItemDays,
  updateItemIn,
} from '../utils/itemTree';
import { canLinkItems, isDuplicateEdge, pruneEdgesTouching } from '../utils/dependencyUtils';

export interface MoveItemPayload {
  readonly itemId: string;
  readonly fromSectionId: string;
  readonly toSectionId: string;
  /** null drops the item at the schedule's root. */
  readonly toParentId: string | null;
  readonly toIndex: number;
  /** Whole days the subtree shifts as part of the same gesture. */
  readonly dayDelta: number;
}

/** What a drag transaction snapshots — everything undo rewinds. */
interface UndoableState {
  readonly sections: Section[];
  readonly dependencies: DependencyEdge[];
}

interface SectionState {
  sections: Section[];
  /** Drawn links between items, any schedule to any schedule. */
  dependencies: DependencyEdge[];
  isInitialized: boolean;

  // Drag transaction state (for undo coalescing)
  _dragSnapshot: UndoableState | null;
  _dragHistoryIndex: number | null;

  // Initialization
  initializeFromProject: () => Promise<void>;
  loadSectionsForProject: (projectId: string) => Promise<void>;
  clearSections: () => void;

  // Schedules
  setSections: (sections: Section[]) => void;
  addSection: (name: string) => string;
  addCompleteSection: (section: Section) => void;
  updateSection: (sectionId: string, updates: Partial<Omit<Section, 'id' | 'type'>>) => void;
  updateSectionWindow: (sectionId: string, startDate: string, endDate: string) => void;
  setSectionMulticolor: (sectionId: string, isMulticolor: boolean) => void;
  deleteSection: (sectionId: string) => { success: boolean; reason?: string };
  toggleSectionCollapse: (sectionId: string) => void;
  toggleSectionLock: (sectionId: string) => void;
  reorderSections: (fromIndex: number, toIndex: number) => void;
  incrementRevision: (sectionId: string) => void;

  // Items — one set of actions for every depth
  addItem: (
    sectionId: string,
    parentId: string | null,
    item: Omit<TimelineItem, 'id' | 'children'> & { children?: TimelineItem[] },
    index?: number
  ) => string;
  updateItem: (sectionId: string, itemId: string, updates: Partial<Omit<TimelineItem, 'id'>>) => void;
  deleteItem: (sectionId: string, itemId: string) => void;
  /** Move the item and everything under it by whole days. */
  shiftItem: (sectionId: string, itemId: string, days: number) => void;
  /** Set one bar's own edges. Children keep their dates. */
  setItemDates: (sectionId: string, itemId: string, start: string, end: string) => void;
  /** Re-parent, re-order and shift in one undoable step — the drag-and-drop commit. */
  moveItem: (payload: MoveItemPayload) => void;
  toggleItemCollapse: (sectionId: string, itemId: string) => void;
  toggleItemLock: (sectionId: string, itemId: string) => void;
  reorderItem: (sectionId: string, itemId: string, toIndex: number) => void;

  // Dependencies — ink between items, never physics
  setDependencies: (dependencies: DependencyEdge[]) => void;
  /** Draw a link. Returns its id, or null when the pair may not be linked. */
  addDependency: (
    from: string,
    fromAnchor: DependencyAnchor,
    to: string,
    toAnchor: DependencyAnchor
  ) => string | null;
  removeDependency: (dependencyId: string) => void;
  /** Move one end of an existing link onto a different item or anchor. */
  retargetDependency: (
    dependencyId: string,
    end: 'from' | 'to',
    itemId: string,
    anchor: DependencyAnchor
  ) => boolean;

  // Save
  saveState: () => void;

  // Drag transactions (undo coalescing)
  beginDragTransaction: () => void;
  commitDragTransaction: () => void;
  rollbackDragTransaction: () => void;
}

// Selectors — items know their own parents, so one lookup covers every depth
export const selectSection = (sectionId: string | null) => (state: SectionState) =>
  sectionId ? state.sections.find((s) => s.id === sectionId) : undefined;

export const selectItem =
  (sectionId: string | null, itemId: string | null) => (state: SectionState) => {
    if (!sectionId || !itemId) return undefined;
    const section = state.sections.find((s) => s.id === sectionId);
    return section ? (findItem(section.items, itemId) ?? undefined) : undefined;
  };

/** Stamp a schedule as modified. Every item mutation goes through this. */
function touch(section: Section, changes: Partial<Section>): Section {
  return {
    ...section,
    ...changes,
    lastModifiedAt: new Date().toISOString(),
    revision: section.revision + 1,
  };
}

function mapSection(
  sections: readonly Section[],
  sectionId: string,
  fn: (section: Section) => Section
): Section[] {
  let changed = false;
  const next = sections.map((section) => {
    if (section.id !== sectionId) return section;
    changed = true;
    return fn(section);
  });
  return changed ? next : (sections as Section[]);
}

export const useSectionStore = create<SectionState>()(
  temporal(
    (set, get) => ({
      sections: [],
      dependencies: [],
      isInitialized: false,
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
              dependencies: data.dependencies ?? [],
              isInitialized: true,
            });
            useSectionStore.temporal.getState().clear();
            return;
          }
        }

        set({ sections: [], dependencies: [], isInitialized: true });
        useSectionStore.temporal.getState().clear();
      },

      loadSectionsForProject: async (projectId: string) => {
        if (!projectId) {
          set({ sections: [], dependencies: [] });
          useSectionStore.temporal.getState().clear();
          return;
        }

        const data = await useProjectStore.getState().loadProjectData(projectId);
        set({
          sections:
            data && data.sections && data.sections.length > 0
              ? data.sections
              : [createDefaultIDTimelineSection()],
          dependencies: data?.dependencies ?? [],
        });
        useSectionStore.temporal.getState().clear();
      },

      setSections: (sections) => set({ sections }),

      clearSections: () => set({ sections: [], dependencies: [] }),

      addCompleteSection: (section) =>
        set((state) => ({ sections: [...state.sections, section] })),

      addSection: (name) => {
        const newId = generateId();
        set((state) => {
          // Line a new schedule up with the ones already on screen
          const extent = sectionsExtent(state.sections);
          const window = extent
            ? { startDate: extent.start, endDate: extent.end }
            : createDefaultWindow();

          const section: Section = {
            id: newId,
            type: 'schedule',
            name: name || '',
            revision: 1,
            lastModifiedAt: new Date().toISOString(),
            color: getScheduleColor(state.sections.length),
            order: state.sections.length,
            isCollapsed: false,
            items: [],
            startDate: window.startDate,
            endDate: window.endDate,
          };
          return { sections: [...state.sections, section] };
        });
        return newId;
      },

      updateSection: (sectionId, updates) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) => touch(section, updates)),
        })),

      // Items hold absolute dates, so re-declaring the window never moves them.
      updateSectionWindow: (sectionId, startDate, endDate) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) =>
            touch(section, {
              startDate: minDayKey(startDate, endDate),
              endDate: maxDayKey(startDate, endDate),
            })
          ),
        })),

      // A root bar's colour is resolved from the schedule as it renders, so
      // switching modes only has to drop the per-item overrides that would
      // otherwise mask whichever palette the schedule now uses.
      setSectionMulticolor: (sectionId, isMulticolor) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) =>
            touch(section, {
              isMulticolor,
              items: section.items.map((item) =>
                item.kind === 'milestone' ? item : { ...item, color: null }
              ),
            })
          ),
        })),

      deleteSection: (sectionId) => {
        const state = get();
        if (state.sections.length <= 1) {
          return { success: false, reason: 'Cannot delete the only schedule.' };
        }

        const projectStore = useProjectStore.getState();
        if (projectStore.project?.pinnedSectionId === sectionId) {
          projectStore.setPinnedSection(null);
        }

        // Links to items that are going go with them
        const gone = state.sections.find((s) => s.id === sectionId);
        const goneIds = new Set<string>();
        if (gone) forEachItem(gone.items, (item) => goneIds.add(item.id));

        set({
          sections: state.sections.filter((s) => s.id !== sectionId),
          dependencies: pruneEdgesTouching(state.dependencies, goneIds),
        });
        return { success: true };
      },

      toggleSectionCollapse: (sectionId) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) => ({
            ...section,
            isCollapsed: !section.isCollapsed,
          })),
        })),

      toggleSectionLock: (sectionId) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) => ({
            ...section,
            isLocked: !section.isLocked,
          })),
        })),

      reorderSections: (fromIndex, toIndex) =>
        set((state) => {
          const sections = [...state.sections];
          const [removed] = sections.splice(fromIndex, 1);
          if (!removed) return state;
          sections.splice(toIndex, 0, removed);
          return { sections: sections.map((section, index) => ({ ...section, order: index })) };
        }),

      incrementRevision: (sectionId) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) => touch(section, {})),
        })),

      addItem: (sectionId, parentId, item, index) => {
        const newId = generateId();
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) => {
            const complete: TimelineItem = { ...item, id: newId, children: item.children ?? [] };
            const target =
              index ??
              (parentId === null
                ? section.items.length
                : (findItem(section.items, parentId)?.children.length ?? 0));
            return touch(section, {
              items: insertItemInto(section.items, parentId, target, complete),
            });
          }),
        }));
        return newId;
      },

      updateItem: (sectionId, itemId, updates) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) =>
            touch(section, {
              items: updateItemIn(section.items, itemId, (item) => {
                const next = { ...item, ...updates };
                // A milestone is a point; keep its two edges in step
                return next.kind === 'milestone' ? { ...next, end: next.start } : next;
              }),
            })
          ),
        })),

      deleteItem: (sectionId, itemId) =>
        set((state) => {
          // The whole subtree goes, and every link touching it goes with it —
          // in the same step, so one undo brings back both.
          const section = state.sections.find((s) => s.id === sectionId);
          const removed = section ? findItem(section.items, itemId) : null;
          const goneIds = removed ? collectIds(removed) : new Set<string>();
          return {
            sections: mapSection(state.sections, sectionId, (s) =>
              touch(s, { items: removeItemFrom(s.items, itemId).items })
            ),
            dependencies: pruneEdgesTouching(state.dependencies, goneIds),
          };
        }),

      shiftItem: (sectionId, itemId, days) => {
        if (days === 0) return;
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) =>
            touch(section, {
              items: updateItemIn(section.items, itemId, (item) => shiftItemDays(item, days)),
            })
          ),
        }));
      },

      setItemDates: (sectionId, itemId, start, end) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) =>
            touch(section, {
              items: updateItemIn(section.items, itemId, (item) => {
                if (item.kind === 'milestone') return { ...item, start, end: start };
                const from = minDayKey(start, end);
                const to = dayKeyDiff(from, maxDayKey(start, end)) < 1
                  ? addDaysToKey(from, 1)
                  : maxDayKey(start, end);
                return { ...item, start: from, end: to };
              }),
            })
          ),
        })),

      /**
       * The one action drag-and-drop commits through. Remove the subtree from
       * wherever it was, shift it by however far the pointer travelled, and put
       * it back where it was dropped — across schedules if that is where it went.
       */
      moveItem: ({ itemId, fromSectionId, toSectionId, toParentId, toIndex, dayDelta }) =>
        set((state) => {
          const source = state.sections.find((s) => s.id === fromSectionId);
          if (!source) return state;

          // Nesting an item inside itself would detach the subtree from the tree
          if (toParentId && (toParentId === itemId || isWithin(source.items, itemId, toParentId))) {
            return state;
          }

          const location = locateItem(source.items, itemId);
          const removal = removeItemFrom(source.items, itemId);
          if (!removal.removed) return state;

          // Joining a different group means taking that group's ink. An explicit
          // colour is an override of wherever the item used to sit, so it stops
          // meaning anything once the item sits somewhere else; dropping it lets
          // the new parent — or the new schedule — resolve the colour instead.
          // Re-ordering inside the same parent leaves a deliberate colour alone.
          const parentChanged =
            fromSectionId !== toSectionId || (location?.parent?.id ?? null) !== toParentId;
          const moved = shiftItemDays(
            parentChanged ? { ...removal.removed, color: null } : removal.removed,
            dayDelta
          );

          // Removing from the same list first shifts every later slot left by one
          let index = toIndex;
          if (fromSectionId === toSectionId) {
            const sameParent = (location?.parent?.id ?? null) === toParentId;
            if (location && sameParent && location.index < toIndex) index -= 1;
          }

          // Nesting already says "this belongs to that", so a link between the
          // moved subtree and its new ancestors stops meaning anything — the
          // same bargain that clears an explicit colour on joining a group.
          let dependencies = state.dependencies;
          if (toParentId) {
            const target = state.sections.find((s) => s.id === toSectionId);
            const ancestorPath = target ? findItemPath(target.items, toParentId) : null;
            if (ancestorPath) {
              const subtreeIds = collectIds(removal.removed);
              const ancestorIds = new Set(ancestorPath.map((item) => item.id));
              dependencies = dependencies.filter(
                (edge) =>
                  !(
                    (subtreeIds.has(edge.from) && ancestorIds.has(edge.to)) ||
                    (subtreeIds.has(edge.to) && ancestorIds.has(edge.from))
                  )
              );
            }
          }

          const now = new Date().toISOString();

          if (fromSectionId === toSectionId) {
            return {
              sections: mapSection(state.sections, toSectionId, (section) =>
                touch(section, { items: insertItemInto(removal.items, toParentId, index, moved) })
              ),
              dependencies,
            };
          }

          return {
            dependencies,
            sections: state.sections.map((section) => {
              if (section.id === fromSectionId) {
                return { ...section, items: removal.items, lastModifiedAt: now, revision: section.revision + 1 };
              }
              if (section.id === toSectionId) {
                return {
                  ...section,
                  items: insertItemInto(section.items, toParentId, index, moved),
                  lastModifiedAt: now,
                  revision: section.revision + 1,
                };
              }
              return section;
            }),
          };
        }),

      toggleItemCollapse: (sectionId, itemId) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) => ({
            ...section,
            items: updateItemIn(section.items, itemId, (item) => ({
              ...item,
              isCollapsed: !item.isCollapsed,
            })),
          })),
        })),

      toggleItemLock: (sectionId, itemId) =>
        set((state) => ({
          sections: mapSection(state.sections, sectionId, (section) => ({
            ...section,
            items: updateItemIn(section.items, itemId, (item) => ({
              ...item,
              isLocked: !item.isLocked,
            })),
          })),
        })),

      setDependencies: (dependencies) => set({ dependencies }),

      addDependency: (from, fromAnchor, to, toAnchor) => {
        const state = get();
        if (!canLinkItems(state.sections, from, to)) return null;
        if (isDuplicateEdge(state.dependencies, from, fromAnchor, to, toAnchor)) return null;
        const id = generateId();
        set({ dependencies: [...state.dependencies, { id, from, fromAnchor, to, toAnchor }] });
        return id;
      },

      removeDependency: (dependencyId) =>
        set((state) => ({
          dependencies: state.dependencies.filter((edge) => edge.id !== dependencyId),
        })),

      retargetDependency: (dependencyId, end, itemId, anchor) => {
        const state = get();
        const edge = state.dependencies.find((e) => e.id === dependencyId);
        if (!edge) return false;

        const next: DependencyEdge =
          end === 'from'
            ? { ...edge, from: itemId, fromAnchor: anchor }
            : { ...edge, to: itemId, toAnchor: anchor };

        if (!canLinkItems(state.sections, next.from, next.to)) return false;
        const others = state.dependencies.filter((e) => e.id !== dependencyId);
        if (isDuplicateEdge(others, next.from, next.fromAnchor, next.to, next.toAnchor)) {
          return false;
        }

        set({ dependencies: state.dependencies.map((e) => (e.id === dependencyId ? next : e)) });
        return true;
      },

      reorderItem: (sectionId, itemId, toIndex) => {
        const section = get().sections.find((s) => s.id === sectionId);
        if (!section) return;
        const location = locateItem(section.items, itemId);
        if (!location) return;
        get().moveItem({
          itemId,
          fromSectionId: sectionId,
          toSectionId: sectionId,
          toParentId: location.parent?.id ?? null,
          toIndex,
          dayDelta: 0,
        });
      },

      saveState: () => {
        useProjectStore.getState().saveCurrentProject(get().sections, get().dependencies);
      },

      beginDragTransaction: () => {
        const { pastStates } = useSectionStore.temporal.getState();
        set({
          _dragSnapshot: structuredClone({
            sections: get().sections,
            dependencies: get().dependencies,
          }),
          _dragHistoryIndex: pastStates.length,
        });
      },

      commitDragTransaction: () => {
        const snapshot = get()._dragSnapshot;
        const historyIndex = get()._dragHistoryIndex;
        const current: UndoableState = {
          sections: get().sections,
          dependencies: get().dependencies,
        };

        set({ _dragSnapshot: null, _dragHistoryIndex: null });
        if (snapshot === null || historyIndex === null) return;

        const { pastStates } = useSectionStore.temporal.getState();
        const changed = JSON.stringify(snapshot) !== JSON.stringify(current);

        if (!changed) {
          if (pastStates.length > historyIndex) {
            useSectionStore.temporal.setState({ pastStates: pastStates.slice(0, historyIndex) });
          }
          return;
        }

        // Collapse every intermediate frame of the drag into one undo step
        useSectionStore.temporal.setState({
          pastStates: [...pastStates.slice(0, historyIndex), snapshot],
          futureStates: [],
        });
      },

      rollbackDragTransaction: () => {
        const snapshot = get()._dragSnapshot;
        const historyIndex = get()._dragHistoryIndex;

        if (snapshot && historyIndex !== null) {
          const { pastStates } = useSectionStore.temporal.getState();
          useSectionStore.temporal.setState({ pastStates: pastStates.slice(0, historyIndex) });
          set({
            sections: snapshot.sections,
            dependencies: snapshot.dependencies,
            _dragSnapshot: null,
            _dragHistoryIndex: null,
          });
        } else {
          set({ _dragSnapshot: null, _dragHistoryIndex: null });
        }
      },
    }),
    {
      limit: 50,
      partialize: (state) => ({ sections: state.sections, dependencies: state.dependencies }),
    }
  )
);
