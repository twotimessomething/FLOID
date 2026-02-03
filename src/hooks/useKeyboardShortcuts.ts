import { useEffect, useCallback, useMemo } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSectionStore, selectMasterSection, selectNonMasterSections } from '../stores/sectionStore';
import { SHORTCUTS } from '../constants/shortcuts';
import type { SelectionState, Section } from '../types';

interface NavigableItem {
  id: string;
  type: SelectionState['type'];
  sectionId: string;
  phaseId: string | null;
  canCollapse: boolean;
  isCollapsed: boolean;
}

/**
 * Hook for handling global keyboard shortcuts in the timeline application.
 * Supports navigation, collapse/expand, deletion, and sidebar interactions.
 */
export function useKeyboardShortcuts(): void {
  const { selection, selectItem, closeModal, isModalOpen } = useUIStore();

  const masterSection = useSectionStore(selectMasterSection);
  const nonMasterSections = useSectionStore(selectNonMasterSections);
  const {
    toggleSectionCollapse,
    togglePhaseCollapse,
    deleteSection,
    deletePhase,
    deleteTask,
    deleteMilestone,
  } = useSectionStore();

  // Helper to add section items to navigable list
  const addSectionItems = (section: Section, items: NavigableItem[], includeSectionHeader: boolean) => {
    // Optionally include section header (for non-master sections)
    if (includeSectionHeader) {
      items.push({
        id: section.id,
        type: 'section',
        sectionId: section.id,
        phaseId: null,
        canCollapse: true,
        isCollapsed: section.isCollapsed,
      });
    }

    if (!section.isCollapsed) {
      // Add phases
      section.phases.forEach((phase) => {
        items.push({
          id: phase.id,
          type: 'phase',
          sectionId: section.id,
          phaseId: null,
          canCollapse: true,
          isCollapsed: phase.isCollapsed,
        });

        if (!phase.isCollapsed) {
          phase.tasks.forEach((task) => {
            items.push({
              id: task.id,
              type: 'task',
              sectionId: section.id,
              phaseId: phase.id,
              canCollapse: false,
              isCollapsed: false,
            });
          });
        }
      });

      // Add milestones
      section.milestones.forEach((milestone) => {
        items.push({
          id: milestone.id,
          type: 'milestone',
          sectionId: section.id,
          phaseId: null,
          canCollapse: false,
          isCollapsed: false,
        });
      });
    }
  };

  // Memoize navigable items and index map for O(1) lookups
  const { items: navigableItems, indexMap } = useMemo(() => {
    const items: NavigableItem[] = [];

    // Add master section (without header - it's always visible)
    if (masterSection) {
      addSectionItems(masterSection, items, false);
    }

    // Add non-master sections (with headers)
    nonMasterSections.forEach((section) => {
      addSectionItems(section, items, true);
    });

    // Build index map for O(1) lookups: key = "type:id"
    const indexMap = new Map<string, number>();
    items.forEach((item, index) => {
      indexMap.set(`${item.type}:${item.id}`, index);
    });

    return { items, indexMap };
  }, [masterSection, nonMasterSections]);

  // Find current selection index using O(1) Map lookup
  const getCurrentIndex = useCallback((): number => {
    if (!selection.id || !selection.type) return -1;
    return indexMap.get(`${selection.type}:${selection.id}`) ?? -1;
  }, [selection.id, selection.type, indexMap]);

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

      const item = navigableItems[newIndex];
      if (item) {
        // Use center of screen for keyboard navigation
        const centerPosition = {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
        selectItem(item.type, item.id, item.sectionId, item.phaseId, centerPosition);
      }
    },
    [navigableItems, getCurrentIndex, selectItem]
  );

  // Handle collapse/expand toggle
  const handleToggleCollapse = useCallback((): void => {
    if (!selection.id || !selection.type || !selection.sectionId) return;

    switch (selection.type) {
      case 'section':
        toggleSectionCollapse(selection.sectionId);
        break;
      case 'phase':
        togglePhaseCollapse(selection.sectionId, selection.id);
        break;
    }
  }, [selection, toggleSectionCollapse, togglePhaseCollapse]);

  // Handle deletion
  const handleDelete = useCallback((): void => {
    if (!selection.id || !selection.type || !selection.sectionId) return;

    switch (selection.type) {
      case 'section':
        deleteSection(selection.sectionId);
        break;
      case 'phase':
        deletePhase(selection.sectionId, selection.id);
        break;
      case 'task':
        if (selection.phaseId) {
          deleteTask(selection.sectionId, selection.phaseId, selection.id);
        }
        break;
      case 'milestone':
        deleteMilestone(selection.sectionId, selection.id);
        break;
    }

    // Close modal after deletion
    closeModal();
  }, [
    selection,
    deleteSection,
    deletePhase,
    deleteTask,
    deleteMilestone,
    closeModal,
  ]);

  // Main keyboard event handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      // Ignore if user is typing in an input or textarea
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
          if (isModalOpen) {
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
          if (selection.type === 'section' || selection.type === 'phase') {
            handleToggleCollapse();
            event.preventDefault();
          }
          break;

        case SHORTCUTS.DELETE:
        case SHORTCUTS.BACKSPACE:
          if (selection.id && selection.type) {
            handleDelete();
            event.preventDefault();
          }
          break;
      }
    },
    [
      isModalOpen,
      selection,
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
