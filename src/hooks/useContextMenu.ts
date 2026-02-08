import { useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';

type SelectionType = 'section' | 'phase' | 'task' | 'milestone';
type MenuLocation = 'label' | 'bar' | 'empty' | 'header';

/**
 * Hook to create context menu handlers for timeline items.
 * Returns handlers for label, bar, and optionally empty area context menus.
 */
export function useContextMenu(
  type: SelectionType,
  id: string,
  sectionId: string,
  phaseId?: string | null,
  taskId?: string | null
): {
  handleLabelContextMenu: (e: React.MouseEvent) => void;
  handleBarContextMenu: (e: React.MouseEvent) => void;
  openAtPosition: (e: React.MouseEvent, location: MenuLocation, clickRelativePosition?: number) => void;
} {
  const openContextMenu = useUIStore((s) => s.openContextMenu);

  const handleLabelContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(
        { x: e.clientX, y: e.clientY },
        type,
        id,
        sectionId,
        phaseId ?? null,
        taskId ?? null,
        'label'
      );
    },
    [openContextMenu, type, id, sectionId, phaseId, taskId]
  );

  const handleBarContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const barElement = e.currentTarget as HTMLElement;
      const barRect = barElement.getBoundingClientRect();
      const clickX = e.clientX - barRect.left;
      const clickRelativePosition = Math.max(0, Math.min(1, clickX / barRect.width));
      openContextMenu(
        { x: e.clientX, y: e.clientY },
        type,
        id,
        sectionId,
        phaseId ?? null,
        taskId ?? null,
        'bar',
        clickRelativePosition
      );
    },
    [openContextMenu, type, id, sectionId, phaseId, taskId]
  );

  const openAtPosition = useCallback(
    (e: React.MouseEvent, location: MenuLocation, clickRelativePosition?: number): void => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu(
        { x: e.clientX, y: e.clientY },
        type,
        id,
        sectionId,
        phaseId ?? null,
        taskId ?? null,
        location,
        clickRelativePosition
      );
    },
    [openContextMenu, type, id, sectionId, phaseId, taskId]
  );

  return { handleLabelContextMenu, handleBarContextMenu, openAtPosition };
}
