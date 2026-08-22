import { memo, useCallback, useMemo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { useProjectStore } from '../../stores/projectStore';
import {
  CREATE_ROW_HEIGHT,
  ROW_HEIGHT,
  dayToX,
  flattenSection,
  headerMilestones,
  sectionBodyHeight,
  xToDay,
} from '../../utils/timelineUtils';
import { layoutLabels, measureMilestoneLabelWidth } from '../../utils/labelLayoutUtils';
import { createBarAt, drawnSpanDescriber, DEFAULT_BAR_DAYS } from '../../utils/creationUtils';
import { getItemColor } from '../../types';
import { snapKeyToBusinessDay } from '../../utils/dayKeys';
import { sectionTintColor } from '../../utils/colorUtils';
import { useCreateGhost, type CreateGestureInfo } from '../../hooks/useCreateGhost';
import { useScheduleRowGestures } from '../../hooks/useScheduleRowGestures';
import { useIsDropSlot } from '../../hooks/useDropState';
import { CollapsedBars } from './CollapsedBars';
import { ItemRow } from './ItemRow';
import { HeaderMilestone } from './HeaderMilestone';
import { ScheduleLabelRow } from './ScheduleLabelRow';
import { MilestoneLines } from './MilestoneLines';
import { DropLine } from './DropLine';
import { GhostBar } from './GhostBar';
import { GhostMilestone } from './GhostMilestone';

interface DragHandleProps {
  readonly onPointerDown: (e: React.PointerEvent) => void;
  readonly style: React.CSSProperties;
}

interface SectionRowProps {
  readonly section: Section;
  readonly isLabel: boolean;
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  readonly sectionIndex?: number;
  readonly dragHandleProps?: DragHandleProps;
  readonly isDragging?: boolean;
  /** True while this schedule is held in the stack of bands under the axis. */
  readonly isSticky?: boolean;
}

/**
 * A schedule: its own row, then one row per item at whatever depth.
 *
 * Both columns walk the same flattened row list, which is what keeps labels and
 * bars aligned no matter how deeply things have been nested by dragging.
 */
export const SectionRow = memo(function SectionRow({
  section,
  isLabel,
  viewport,
  pixelsPerDay,
  sectionIndex,
  dragHandleProps,
  isDragging,
  isSticky,
}: SectionRowProps): JSX.Element {
  const pinnedSectionId = useProjectStore((s) => s.project?.pinnedSectionId ?? null);
  const coloredRows = useProjectStore(
    (s) => s.project?.settings?.coloredRows ?? DEFAULT_PROJECT_SETTINGS.coloredRows
  );
  const skipWeekends = useProjectStore(
    (s) => s.project?.settings?.skipWeekends ?? DEFAULT_PROJECT_SETTINGS.skipWeekends
  );

  const isPinned = section.id === pinnedSectionId;

  // The schedule's own row, and everything it answers to. The band under the
  // axis runs the same hook, so the two rows cannot drift apart.
  const headerGestures = useScheduleRowGestures(section.id, viewport, pixelsPerDay);

  const rows = useMemo(() => flattenSection(section), [section]);
  const bodyHeight = useMemo(() => sectionBodyHeight(section), [section]);
  const markers = useMemo(() => headerMilestones(section), [section]);
  const rootBarCount = useMemo(
    () => section.items.filter((item) => item.kind === 'bar').length,
    [section.items]
  );

  // Slot at the very end of the root list — where "drop past the last row" goes
  const isAppendSlot = useIsDropSlot(section.id, null, section.items.length);

  // Collision-aware label placement. A sticky schedule prints its labels up in
  // the sticky band, so they do not reserve room here. A collapsed schedule
  // folds its bars into this same row, but only across its upper half, so its
  // markers keep the lower half and name themselves there like any other.
  const labelPlacements = useMemo(
    () =>
      layoutLabels(
        (isSticky ? [] : markers).map((milestone) => ({
          id: milestone.id,
          center: dayToX(milestone.start, viewport, pixelsPerDay),
          width: measureMilestoneLabelWidth(milestone.name),
        }))
      ),
    [markers, isSticky, viewport, pixelsPerDay]
  );

  // -- creating in the schedule's open space --------------------------------

  // "Skip weekends" belongs to the commit, not the gesture: the ghost tracks
  // the cursor exactly, and the day it lands on is squared up once, here.
  const snapCreateDay = useCallback(
    (key: string): string => (skipWeekends ? snapKeyToBusinessDay(key) : key),
    [skipWeekends]
  );

  const handleBodyGhostDoubleClick = useCallback(
    ({ startPx, point }: CreateGestureInfo): void => {
      createBarAt(
        section.id,
        { startDay: snapCreateDay(xToDay(startPx, viewport, pixelsPerDay)) },
        point
      );
    },
    [section.id, viewport, pixelsPerDay, snapCreateDay]
  );

  const handleBodyGhostDraw = useCallback(
    ({ startPx, endPx, point }: CreateGestureInfo): void => {
      createBarAt(
        section.id,
        {
          // Both drawn edges were chosen, so each squares up on its own — the
          // same bargain resize strikes. `createBarAt` holds the one-day floor.
          span: {
            start: snapCreateDay(xToDay(startPx, viewport, pixelsPerDay)),
            end: snapCreateDay(xToDay(endPx, viewport, pixelsPerDay)),
          },
        },
        point
      );
    },
    [section.id, viewport, pixelsPerDay, snapCreateDay]
  );

  // The dates the draw reports come off the same conversion the drop commits
  const describeSpan = useMemo(
    () => drawnSpanDescriber(viewport, pixelsPerDay, snapCreateDay),
    [viewport, pixelsPerDay, snapCreateDay]
  );

  const bodyGhost = useCreateGhost({
    defaultWidth: DEFAULT_BAR_DAYS * pixelsPerDay,
    describeSpan,
    onDoubleClickCreate: handleBodyGhostDoubleClick,
    onDrawCreate: handleBodyGhostDraw,
  });

  const ghostColor = section.isMulticolor
    ? getItemColor({ color: null } as never, section, rootBarCount, Math.max(1, rootBarCount + 1))
    : section.color;

  const tintColor = sectionTintColor(section.color, section.isMulticolor, coloredRows);
  const tint = tintColor ? { backgroundColor: tintColor } : undefined;

  // -- labels column -------------------------------------------------------

  if (isLabel) {
    return (
      <div
        className={`border-t border-[var(--color-hairline)] ${isDragging ? 'opacity-50' : ''}`}
        style={tint}
        role="group"
        aria-label={`${section.name} schedule`}
      >
        <ScheduleLabelRow
          section={section}
          dragHandleProps={sectionIndex !== undefined ? dragHandleProps : undefined}
        />

        {!section.isCollapsed && (
          <div role="list" aria-label={`${section.name} items`}>
            {rows.map((row) => (
              <ItemRow
                key={row.item.id}
                row={row}
                section={section}
                isLabel
                viewport={viewport}
                pixelsPerDay={pixelsPerDay}
              />
            ))}
            <div style={{ height: CREATE_ROW_HEIGHT }} aria-hidden="true" />
          </div>
        )}
      </div>
    );
  }

  // -- timeline column -----------------------------------------------------

  return (
    <div
      className={`border-t border-[var(--color-hairline)] ${isDragging ? 'opacity-50' : ''}`}
      style={tint}
      role="group"
      aria-label={`${section.name} schedule timeline`}
    >
      {/* The schedule's own row: root milestones, and its bars when collapsed */}
      <div
        ref={headerGestures.rowRef}
        className={`relative timeline-plot ${headerGestures.ghostX !== null ? 'cursor-copy' : ''}`}
        style={{ height: ROW_HEIGHT }}
        data-drop-header={section.id}
        data-drop-section={section.id}
        onDoubleClick={headerGestures.handleDoubleClick}
        onContextMenu={headerGestures.handleContextMenu}
        onPointerMove={headerGestures.handlePointerMove}
        onPointerLeave={headerGestures.handlePointerLeave}
      >
        {headerGestures.ghostX !== null && (
          <GhostMilestone x={headerGestures.ghostX} lineHeight={bodyHeight} />
        )}

        <CollapsedBars section={section} viewport={viewport} pixelsPerDay={pixelsPerDay} />

        {/* A pinned schedule already rules its lines the whole height of the
            sheet, from the timeline; drawing them again here would print them
            twice over its own rows. */}
        {!isPinned && (
          <MilestoneLines
            milestones={markers}
            viewport={viewport}
            pixelsPerDay={pixelsPerDay}
            top={ROW_HEIGHT}
            height={bodyHeight}
          />
        )}

        {markers.map((milestone) => (
          <HeaderMilestone
            key={milestone.id}
            item={milestone}
            section={section}
            viewport={viewport}
            pixelsPerDay={pixelsPerDay}
            isHidden={isSticky}
            labelPlacement={labelPlacements.get(milestone.id)}
          />
        ))}
      </div>

      {/* Item rows, then open space that is both a create surface and a drop zone */}
      {!section.isCollapsed && (
        <div className="relative timeline-plot" role="list" aria-label={`${section.name} bars`}>
          {rows.map((row) => (
            <ItemRow
              key={row.item.id}
              row={row}
              section={section}
              isLabel={false}
              viewport={viewport}
              pixelsPerDay={pixelsPerDay}
            />
          ))}

          <div
            className={`group relative ${bodyGhost.ghost !== null ? 'cursor-copy' : ''}`}
            style={{ height: CREATE_ROW_HEIGHT }}
            data-drop-body={section.id}
            data-drop-count={section.items.length}
            onDoubleClick={bodyGhost.handleDoubleClick}
            onPointerMove={bodyGhost.handlePointerMove}
            onPointerLeave={bodyGhost.handlePointerLeave}
            onPointerDown={bodyGhost.handlePointerDown}
          >
            {isAppendSlot && <DropLine position="top" />}
            {bodyGhost.ghost !== null && (
              <GhostBar
                ref={bodyGhost.ghostRef}
                readoutRef={bodyGhost.readoutRef}
                left={bodyGhost.ghost.left}
                width={bodyGhost.ghost.width}
                color={ghostColor}
                isDrawing={bodyGhost.ghost.isDrawing}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});
