import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ViewportBounds } from '../types';
import { DEFAULT_PROJECT_SETTINGS } from '../types';
import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { createMilestoneAt, createTaskAt } from '../utils/creationUtils';
import { CREATE_PREVIEW_ATTR, captureCreateSource, withCreateSource } from '../utils/createHandoff';
import { HOVER_STILL_DELAY_MS } from './useCreateGhost';
import { useIsTaskPointer } from './useTaskPointer';
import { snapKeyToBusinessDay } from '../utils/dayKeys';
import { xToDay } from '../utils/timelineUtils';

interface ScheduleRowGestures {
  /** Goes on the row surface — every day the gestures report is measured off it. */
  readonly rowRef: React.RefObject<HTMLDivElement>;
  /** Where the ghost marker is standing, or null when the row is not being hovered. */
  readonly ghostX: number | null;
  /** The ghost is a task, not a milestone: ⌥ is held. */
  readonly isTaskGhost: boolean;
  /**
   * ⌥-click: a task at the top of the schedule, on the day under the cursor.
   * A plain click on the row's open paper lets go of the selection.
   */
  readonly handleClick: (e: React.MouseEvent) => void;
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
 *
 * Whatever the ghost marker promised is what the click makes, and it is seen
 * to be: the ghost is recorded as the click lands and handed to the creation
 * (`withCreateSource`), which flies a milestone from the ghost diamond onto
 * its day and a task from the ghost circle down into its new row at the top
 * of the schedule.
 *
 * A locked schedule takes nothing new, so its row offers nothing: no ghost,
 * no copy cursor, and a double-click that makes nothing.
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

  const isLocked = useSectionStore(
    (s) => s.sections.find((section) => section.id === sectionId)?.isLocked === true
  );

  const isTaskPointer = useIsTaskPointer();
  const rowRef = useRef<HTMLDivElement>(null);
  /** Where the ghost first appeared — React draws it there, and no further. */
  const [ghostX, setGhostX] = useState<number | null>(null);
  /** Where the pointer is now, which is where the ghost is moved to. */
  const pointerXRef = useRef(0);
  /** Showing, rather than waiting for the pointer to come to rest. */
  const isGhostShownRef = useRef(false);
  const restTimerRef = useRef<number | null>(null);

  const clearRestTimer = useCallback((): void => {
    if (restTimerRef.current === null) return;
    window.clearTimeout(restTimerRef.current);
    restTimerRef.current = null;
  }, []);

  useEffect(() => clearRestTimer, [clearRestTimer]);

  /**
   * Move the ghost without a render. It follows the pointer sixty times a
   * second, and the row it stands in is a whole schedule — the same bargain
   * the playhead strikes.
   */
  const placeGhost = useCallback((x: number): void => {
    const ghost = rowRef.current?.querySelector<HTMLElement>(`[${CREATE_PREVIEW_ATTR}]`);
    if (ghost) ghost.style.left = `${x}px`;
  }, []);

  // A render draws the ghost back where it first appeared, and ⌥ swaps the
  // diamond for a circle that mounts there too. Putting it back under the
  // pointer, before either is painted, costs one write.
  useLayoutEffect(() => {
    if (ghostX !== null) placeGhost(pointerXRef.current);
  });

  const hideGhost = useCallback((): void => {
    clearRestTimer();
    isGhostShownRef.current = false;
    setGhostX((previous) => (previous === null ? previous : null));
  }, [clearRestTimer]);

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
  const handlePointerMove = useCallback(
    (e: React.PointerEvent): void => {
      if (
        isLocked ||
        e.pointerType === 'touch' ||
        e.buttons !== 0 ||
        e.target !== e.currentTarget
      ) {
        hideGhost();
        return;
      }
      const bounds = rowRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const x = e.clientX - bounds.left;
      pointerXRef.current = x;
      if (isGhostShownRef.current) {
        if (ghostX === null) setGhostX(x);
        else placeGhost(x);
        return;
      }
      // First appearance waits for the pointer to settle, as an item row's
      // ghost does — a pointer crossing the row on its way somewhere else
      // should not flash a hint and a rule down the whole schedule.
      clearRestTimer();
      restTimerRef.current = window.setTimeout(() => {
        restTimerRef.current = null;
        isGhostShownRef.current = true;
        setGhostX(pointerXRef.current);
      }, HOVER_STILL_DELAY_MS);
    },
    [isLocked, ghostX, hideGhost, placeGhost, clearRestTimer]
  );

  const handlePointerLeave = hideGhost;

  // A root task takes a row of its own, so from the schedule's row it goes
  // to the top of the schedule — the row directly below the one clicked.
  const handleClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target !== e.currentTarget) return;
      if (!(isTaskPointer || e.altKey)) {
        useUIStore.getState().clearSelection();
        return;
      }
      if (isLocked) return;
      e.stopPropagation();
      const point = { x: e.clientX, y: e.clientY };
      const day = snapCreateDay(dayAtEvent(e));
      const source = captureCreateSource(rowRef.current, 'point', point);
      // The ghost becomes the task. It stays shown, so the next move brings a
      // fresh one straight back — tasks are dropped in a run.
      setGhostX(null);
      withCreateSource(source, () => createTaskAt(sectionId, { day, index: 0 }, point));
    },
    [sectionId, isLocked, isTaskPointer, dayAtEvent, snapCreateDay]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target !== e.currentTarget || isLocked) return;
      // Two ⌥-clicks were two tasks, not a milestone
      if (isTaskPointer || e.altKey) return;
      const point = { x: e.clientX, y: e.clientY };
      const day = snapCreateDay(dayAtEvent(e));
      const source = captureCreateSource(rowRef.current, 'point', point);
      // The ghost becomes the milestone rather than standing beside it
      hideGhost();
      withCreateSource(source, () => createMilestoneAt(sectionId, { day }, point));
    },
    [sectionId, isLocked, isTaskPointer, dayAtEvent, snapCreateDay, hideGhost]
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
    isTaskGhost: isTaskPointer,
    handleClick,
    handleDoubleClick,
    handleContextMenu,
    handlePointerMove,
    handlePointerLeave,
  };
}
