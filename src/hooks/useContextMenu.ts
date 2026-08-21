import { useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { ContextMenuLocation } from '../stores/uiStore';
import type { SelectionState } from '../types/timeline';

/**
 * Opens the context menu for one target. Items no longer carry a parent path,
 * so a menu needs an id, the schedule it belongs to, and where it was opened.
 */
export function useContextMenu(
  targetType: SelectionState['type'],
  targetId: string,
  sectionId: string
): {
  handleLabelContextMenu: (e: React.MouseEvent) => void;
  handleBarContextMenu: (e: React.MouseEvent) => void;
  openAt: (e: React.MouseEvent, location: ContextMenuLocation, clickDay?: string) => void;
} {
  const openContextMenu = useUIStore((s) => s.openContextMenu);

  const openAt = useCallback(
    (e: React.MouseEvent, location: ContextMenuLocation, clickDay?: string): void => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetType,
        targetId,
        sectionId,
        location,
        clickDay,
      });
    },
    [openContextMenu, targetType, targetId, sectionId]
  );

  const handleLabelContextMenu = useCallback(
    (e: React.MouseEvent): void => openAt(e, 'label'),
    [openAt]
  );

  const handleBarContextMenu = useCallback(
    (e: React.MouseEvent): void => openAt(e, 'bar'),
    [openAt]
  );

  return { handleLabelContextMenu, handleBarContextMenu, openAt };
}
