import { useEffect, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useTeamStore } from '../stores/teamStore';
import { SHORTCUTS } from '../constants/shortcuts';
import type { SelectionState } from '../types';

interface NavigableItem {
  id: string;
  type: SelectionState['type'];
  canCollapse: boolean;
  isCollapsed: boolean;
}

/**
 * Hook for handling global keyboard shortcuts in the timeline application.
 * Supports navigation, collapse/expand, deletion, and sidebar interactions.
 */
export function useKeyboardShortcuts(): void {
  const { selection, setSelection, closeSidebar, isSidebarOpen } = useUIStore();
  const { phases, togglePhaseCollapse, deletePhase, deleteElement, deleteMilestone } =
    useTimelineStore();
  const {
    teams,
    toggleTeamCollapse,
    toggleTeamPhaseCollapse,
    deleteTeam,
    deleteTeamPhase,
    deleteTeamElement,
  } = useTeamStore();

  // Build flat list of navigable items for arrow key navigation
  const getNavigableItems = useCallback((): NavigableItem[] => {
    const items: NavigableItem[] = [];

    // Add phases and their children
    phases.forEach((phase) => {
      items.push({
        id: phase.id,
        type: 'phase',
        canCollapse: true,
        isCollapsed: phase.isCollapsed,
      });

      if (!phase.isCollapsed) {
        phase.elements.forEach((element) => {
          items.push({
            id: element.id,
            type: 'element',
            canCollapse: false,
            isCollapsed: false,
          });
        });

        phase.milestones.forEach((milestone) => {
          items.push({
            id: milestone.id,
            type: 'milestone',
            canCollapse: false,
            isCollapsed: false,
          });
        });
      }
    });

    // Add teams and their children
    teams.forEach((team) => {
      items.push({
        id: team.id,
        type: 'team',
        canCollapse: true,
        isCollapsed: team.isCollapsed,
      });

      if (!team.isCollapsed) {
        team.phases.forEach((teamPhase) => {
          items.push({
            id: teamPhase.id,
            type: 'teamPhase',
            canCollapse: true,
            isCollapsed: teamPhase.isCollapsed,
          });

          if (!teamPhase.isCollapsed) {
            teamPhase.elements.forEach((element) => {
              items.push({
                id: element.id,
                type: 'teamElement',
                canCollapse: false,
                isCollapsed: false,
              });
            });
          }
        });
      }
    });

    return items;
  }, [phases, teams]);

  // Find current selection index in navigable items
  const getCurrentIndex = useCallback((): number => {
    if (!selection.id || !selection.type) return -1;
    const items = getNavigableItems();
    return items.findIndex(
      (item) => item.id === selection.id && item.type === selection.type
    );
  }, [selection, getNavigableItems]);

  // Handle navigation (arrow keys)
  const handleNavigation = useCallback(
    (direction: 'up' | 'down'): void => {
      const items = getNavigableItems();
      if (items.length === 0) return;

      const currentIndex = getCurrentIndex();
      let newIndex: number;

      if (currentIndex === -1) {
        // No selection - start from beginning or end
        newIndex = direction === 'down' ? 0 : items.length - 1;
      } else {
        newIndex =
          direction === 'down'
            ? Math.min(currentIndex + 1, items.length - 1)
            : Math.max(currentIndex - 1, 0);
      }

      const item = items[newIndex];
      if (item) {
        setSelection({ type: item.type, id: item.id });
      }
    },
    [getNavigableItems, getCurrentIndex, setSelection]
  );

  // Handle collapse/expand toggle
  const handleToggleCollapse = useCallback((): void => {
    if (!selection.id || !selection.type) return;

    switch (selection.type) {
      case 'phase':
        togglePhaseCollapse(selection.id);
        break;
      case 'team':
        toggleTeamCollapse(selection.id);
        break;
      case 'teamPhase': {
        // Find the team that contains this phase
        const team = teams.find((t) =>
          t.phases.some((p) => p.id === selection.id)
        );
        if (team) {
          toggleTeamPhaseCollapse(team.id, selection.id);
        }
        break;
      }
    }
  }, [selection, togglePhaseCollapse, toggleTeamCollapse, toggleTeamPhaseCollapse, teams]);

  // Handle deletion
  const handleDelete = useCallback((): void => {
    if (!selection.id || !selection.type) return;

    switch (selection.type) {
      case 'phase':
        deletePhase(selection.id);
        break;
      case 'element': {
        // Find the phase containing this element
        const phase = phases.find((p) =>
          p.elements.some((e) => e.id === selection.id)
        );
        if (phase) {
          deleteElement(phase.id, selection.id);
        }
        break;
      }
      case 'milestone': {
        // Find the phase containing this milestone
        const phaseWithMilestone = phases.find((p) =>
          p.milestones.some((m) => m.id === selection.id)
        );
        if (phaseWithMilestone) {
          deleteMilestone(phaseWithMilestone.id, selection.id);
        }
        break;
      }
      case 'team':
        deleteTeam(selection.id);
        break;
      case 'teamPhase': {
        const teamWithPhase = teams.find((t) =>
          t.phases.some((p) => p.id === selection.id)
        );
        if (teamWithPhase) {
          deleteTeamPhase(teamWithPhase.id, selection.id);
        }
        break;
      }
      case 'teamElement': {
        // Find team and phase containing this element
        for (const team of teams) {
          for (const teamPhase of team.phases) {
            if (teamPhase.elements.some((e) => e.id === selection.id)) {
              deleteTeamElement(team.id, teamPhase.id, selection.id);
              break;
            }
          }
        }
        break;
      }
    }

    // Close sidebar after deletion
    closeSidebar();
  }, [
    selection,
    phases,
    teams,
    deletePhase,
    deleteElement,
    deleteMilestone,
    deleteTeam,
    deleteTeamPhase,
    deleteTeamElement,
    closeSidebar,
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
        // Only allow Escape to close sidebar when in input
        if (event.key === SHORTCUTS.ESCAPE && isSidebarOpen) {
          closeSidebar();
          event.preventDefault();
        }
        return;
      }

      switch (event.key) {
        case SHORTCUTS.ESCAPE:
          if (isSidebarOpen) {
            closeSidebar();
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
          if (selection.type === 'phase' || selection.type === 'team' || selection.type === 'teamPhase') {
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
      isSidebarOpen,
      selection,
      closeSidebar,
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
