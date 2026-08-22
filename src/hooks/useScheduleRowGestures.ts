import { useCallback, useRef, useState } from 'react';
import type { ViewportBounds } from '../types';
import { DEFAULT_PROJECT_SETTINGS } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { createMilestoneAt } from '../utils/creationUtils';
import { snapKeyToBusinessDay } from '../utils/dayKeys';
import { xToDay } from '../utils/timelineUtils';

interface ScheduleRowGestures {
  /** Goes on the row surface — every day the gestures report is measured off it. */
  readonly rowRef: React.RefObject<HTMLDivElement>;
  /** Where the ghost marker is standing, or null when the row is not being hovered. */
  readonly ghostX: number | null;
  readonly handleDoubleClick: (e: React.MouseEvent) => void;
  readonly handleContextMenu: (e: React.MouseEvent) => void;
  readonly handlePointerMove: (e: React.PointerEvent) => void;
  readonly handlePointerLeave: () => void;
}

/**
 * What a schedule's own row answers to: a double-click drops a milestone on
 * the day under the cursor, a hover previews it, and a right-click opens the
 * schedule's menu on that same day.
 *
 * It lives in a hook because the row is drawn twice — once on the sheet by
 * `SectionRow`, and again as the band `StickyScheduleRow` holds under the axis
 * once the schedule has scrolled past. The band stands in for the row, so it
 * has to be the row: a marker that could only be dropped at the top of the
 * sheet would vanish the moment the sheet moved.
 */
export function useScheduleRowGestures(
  sectionId: string,
  viewport: ViewportBounds,
  pixelsPerDay: number
): ScheduleRowGestures {
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const skipWeekends = useProjectStore(
    (s) => s.project?.settings?.skipWeekends ?? DEFAULT_PROJECT_SETTINGS.skipWeekends
  );

  const rowRef = useRef<HTMLDivElement>(null);
  const [ghostX, setGhostX] = useState<number | null>(null);

  const dayAtEvent = useCallback(
    (e: React.MouseEvent): string => {
      const bounds = rowRef.current?.getBoundingClientRect();
      return xToDay(bounds ? e.clientX - bounds.left : 0, viewport, pixelsPerDay);
    },
    [viewport, pixelsPerDay]
  );

  // "Skip weekends" belongs to the commit, not the gesture: the ghost tracks
  // the cursor exactly, and the day it lands on is squared up once, here.
  const snapCreateDay = useCallback(
    (key: string): string => (skipWeekends ? snapKeyToBusinessDay(key) : key),
    [skipWeekends]
  );

  // The ghost tracks free space on the schedule's own row only — over a marker
  // or a collapsed bar the double-click would mean something else, so the row
  // stops offering a milestone there. A held button means a drag is passing
  // through, not a hover.
  const handlePointerMove = useCallback((e: React.PointerEvent): void => {
    if (e.pointerType === 'touch' || e.buttons !== 0 || e.target !== e.currentTarget) {
      setGhostX((previous) => (previous === null ? previous : null));
      return;
    }
    const bounds = rowRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setGhostX(e.clientX - bounds.left);
  }, []);

  const handlePointerLeave = useCallback((): void => {
    setGhostX(null);
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target !== e.currentTarget) return;
      createMilestoneAt(
        sectionId,
        { day: snapCreateDay(dayAtEvent(e)) },
        { x: e.clientX, y: e.clientY }
      );
    },
    [sectionId, dayAtEvent, snapCreateDay]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetType: 'section',
        targetId: sectionId,
        sectionId,
        location: 'header',
        clickDay: dayAtEvent(e),
      });
    },
    [openContextMenu, sectionId, dayAtEvent]
  );

  return {
    rowRef,
    ghostX,
    handleDoubleClick,
    handleContextMenu,
    handlePointerMove,
    handlePointerLeave,
  };
}
