import { useEffect, useCallback, useMemo } from 'react';
import {
  useUIStore,
  showItemDeletedToast,
  showSectionDeletedToast,
} from '../stores/uiStore';
import { useSectionStore } from '../stores/sectionStore';
import { usePinnedSection } from './usePinnedSection';
import { SHORTCUTS } from '../constants/shortcuts';
import { commandForKeydown, executeCommand } from '../commands/executeCommand';
import { isDesktop } from '../platform/detect';
import { flattenSection, headerMilestones } from '../utils/timelineUtils';
import { findItem } from '../utils/itemTree';
import type { Section } from '../types';

interface NavigableRow {
  readonly id: string;
  readonly type: 'section' | 'item';
  readonly sectionId: string;
}

/**
 * Hook for handling global keyboard shortcuts in the timeline application.
 * Supports navigation, collapse/expand, deletion, and sidebar interactions.
 */
export function useKeyboardShortcuts(): void {
  const selection = useUIStore((s) => s.selection);
  const selectItem = useUIStore((s) => s.selectItem);
  const selectSection = useUIStore((s) => s.selectSection);
  const closeModal = useUIStore((s) => s.closeModal);
  const isModalOpen = useUIStore((s) => s.isModalOpen);
  const showToast = useUIStore((s) => s.showToast);
  const selectedDependencyId = useUIStore((s) => s.selectedDependencyId);
  const selectDependency = useUIStore((s) => s.selectDependency);

  const { pinnedSection, unpinnedSections } = usePinnedSection();
  const sections = useSectionStore((s) => s.sections);
  const toggleSectionCollapse = useSectionStore((s) => s.toggleSectionCollapse);
  const toggleItemCollapse = useSectionStore((s) => s.toggleItemCollapse);
  const deleteSection = useSectionStore((s) => s.deleteSection);
  const deleteItem = useSectionStore((s) => s.deleteItem);
  const removeDependency = useSectionStore((s) => s.removeDependency);

  /**
   * Arrow keys walk exactly what is on screen. `flattenSection` is the same
   * function the timeline renders from, so navigation can never disagree with
   * the rows the user is looking at — at any nesting depth.
   */
  const { rows: navigableItems, indexMap } = useMemo(() => {
    const rows: NavigableRow[] = [];

    const addSection = (section: Section): void => {
      rows.push({ id: section.id, type: 'section', sectionId: section.id });
      if (section.isCollapsed) return;
      for (const row of flattenSection(section)) {
        rows.push({ id: row.item.id, type: 'item', sectionId: section.id });
      }
      // A schedule's own markers sit on its header row, after its bars
      for (const milestone of headerMilestones(section)) {
        rows.push({ id: milestone.id, type: 'item', sectionId: section.id });
      }
    };

    if (pinnedSection) addSection(pinnedSection);
    unpinnedSections.forEach(addSection);

    const map = new Map<string, number>();
    rows.forEach((row, index) => map.set(row.id, index));
    return { rows, indexMap: map };
  }, [pinnedSection, unpinnedSections]);

  const getCurrentIndex = useCallback((): number => {
    if (!selection.id) return -1;
    return indexMap.get(selection.id) ?? -1;
  }, [selection.id, indexMap]);

  // Handle navigation (arrow keys)
  const handleNavigation = useCallback(
    (direction: 'up' | 'down'): void => {
      if (navigableItems.length === 0) return;

      const currentIndex = getCurrentIndex();
      let newIndex: number;

      if (currentIndex === -1) {
        // No selection - start from beginning or end
        newIndex = direction === 'down' ? 0 : navigableItems.length - 1;
      } else {
        newIndex =
          direction === 'down'
            ? Math.min(currentIndex + 1, navigableItems.length - 1)
            : Math.max(currentIndex - 1, 0);
      }

      const row = navigableItems[newIndex];
      if (!row) return;

      const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      if (row.type === 'section') selectSection(row.sectionId, center);
      else selectItem(row.id, row.sectionId, center);
    },
    [navigableItems, getCurrentIndex, selectItem, selectSection]
  );

  const handleToggleCollapse = useCallback((): void => {
    if (!selection.id || !selection.sectionId) return;
    if (selection.type === 'section') {
      toggleSectionCollapse(selection.sectionId);
      return;
    }
    if (selection.type === 'item') {
      toggleItemCollapse(selection.sectionId, selection.id);
    }
  }, [selection, toggleSectionCollapse, toggleItemCollapse]);

  const handleDelete = useCallback((): void => {
    if (!selection.id || !selection.sectionId) return;
    // Read before the delete: the notice names what went, and offers it back
    const section = sections.find((s) => s.id === selection.sectionId);

    if (selection.type === 'section') {
      const wasPinned = pinnedSection?.id === selection.sectionId;
      const result = deleteSection(selection.sectionId);
      if (result.success && section) showSectionDeletedToast(section, wasPinned);
      else if (result.reason) showToast('warning', result.reason);
    } else if (selection.type === 'item') {
      const item = section ? findItem(section.items, selection.id) : null;
      if (item) showItemDeletedToast(item);
      deleteItem(selection.sectionId, selection.id);
    }

    closeModal();
  }, [selection, sections, pinnedSection, deleteSection, deleteItem, closeModal, showToast]);

  /** Only a bar with children has anything to fold. */
  const canToggleSelection = useMemo((): boolean => {
    if (selection.type === 'section') return true;
    if (selection.type !== 'item' || !selection.sectionId || !selection.id) return false;
    const section = sections.find((s) => s.id === selection.sectionId);
    const item = section ? findItem(section.items, selection.id) : null;
    return item !== null && item.kind === 'bar' && item.children.length > 0;
  }, [selection, sections]);

  // Main keyboard event handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      // Menu-grade combos route through the command registry — the same
      // handlers a native menu drives. On desktop the menu owns these
      // accelerators, so the DOM handler stands down. Runs before the
      // input-target check on purpose: undo-everywhere is the contract.
      if (!isDesktop()) {
        const commandId = commandForKeydown(event);
        if (commandId) {
          executeCommand(commandId);
          event.preventDefault();
          return;
        }
      }

      // Ignore other shortcuts if user is typing in an input or textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Only allow Escape to close modal when in input
        if (event.key === SHORTCUTS.ESCAPE && isModalOpen) {
          closeModal();
          event.preventDefault();
        }
        return;
      }

      switch (event.key) {
        case SHORTCUTS.ESCAPE:
          if (selectedDependencyId) {
            selectDependency(null);
          } else if (isModalOpen) {
            closeModal();
          }
          event.preventDefault();
          break;

        case SHORTCUTS.ARROW_UP:
          handleNavigation('up');
          event.preventDefault();
          break;

        case SHORTCUTS.ARROW_DOWN:
          handleNavigation('down');
          event.preventDefault();
          break;

        case SHORTCUTS.ENTER:
        case SHORTCUTS.SPACE:
          if (canToggleSelection) {
            handleToggleCollapse();
            event.preventDefault();
          }
          break;

        case SHORTCUTS.DELETE:
        case SHORTCUTS.BACKSPACE:
          // A selected link holds the selection slot, so it takes the key
          if (selectedDependencyId) {
            removeDependency(selectedDependencyId);
            selectDependency(null);
            event.preventDefault();
          } else if (selection.id && selection.type) {
            handleDelete();
            event.preventDefault();
          }
          break;
      }
    },
    [
      isModalOpen,
      selection,
      selectedDependencyId,
      selectDependency,
      removeDependency,
      canToggleSelection,
      closeModal,
      handleNavigation,
      handleToggleCollapse,
      handleDelete,
    ]
  );

  // Set up and clean up event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
