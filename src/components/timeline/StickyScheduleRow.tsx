import { useMemo } from 'react';
import type { Section, TimelineItem, ViewportBounds } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import {
  ROW_HEIGHT,
  STICKY_SLOT_HEIGHT,
  dayToX,
  headerMilestones,
  stickySlotTop,
} from '../../utils/timelineUtils';
import { layoutLabels, measureMilestoneLabelWidth } from '../../utils/labelLayoutUtils';
import { sectionTintColor } from '../../utils/colorUtils';
import { useScheduleRowGestures } from '../../hooks/useScheduleRowGestures';
import { useIsDropHeader } from '../../hooks/useDropState';
import { CollapsedBars } from './CollapsedBars';
import { GhostMilestone } from './GhostMilestone';
import { GhostTask } from './GhostTask';
import { MilestoneLines } from './MilestoneLines';
import { StickyMilestone } from './StickyMilestone';
import { TimelineGrid } from './TimelineGrid';
import { TodayLine } from './TodayLine';

interface StickyScheduleRowProps {
  /** A schedule held under the axis. */
  readonly section: Section;
  /** Where it sits in the held stack — 0 is directly under the axis. */
  readonly slot: number;
  /** The pinned schedule's markers — their lines rule through this band too. */
  readonly pinnedMarkers: readonly TimelineItem[];
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  /** The schedule is in the hand: what the band prints drains with it. */
  readonly isLifted?: boolean;
}

interface StickyMilestoneData {
  readonly id: string;
  readonly name: string;
  readonly left: number;
  readonly item: TimelineItem;
}

/**
 * A schedule's own row, held under the date axis while its items scroll past —
 * the timeline half of it. `StickyScheduleLabel` holds the other half, in the
 * labels column, off the same schedule.
 *
 * A schedule keeps its band once it is held, taking the slot below the last one
 * held, so the stack under the axis is every schedule above the one being read.
 * That is the point: a marker only means something next to the schedule it
 * belongs to, and reading one low on the sheet means reading it against all of
 * them.
 *
 * The band stands in for that row, so it *is* that row, down to the hairline it
 * prints under and the double-click that drops a marker on it — a row that lost
 * its rule and its only affordance the moment the sheet moved would just be a
 * picture of itself. The sheet's rules pass through it too — gridlines, today,
 * and the pinned schedule's reference lines. Paper laid over them would cut
 * every vertical on the sheet at the same height, which reads as a seam.
 */
export function StickyScheduleRow({
  section,
  slot,
  pinnedMarkers,
  viewport,
  pixelsPerDay,
  isLifted = false,
}: StickyScheduleRowProps): JSX.Element {
  const selectedId = useUIStore((s) => (s.selection.type === 'item' ? s.selection.id : null));
  const coloredRows = useProjectStore(
    (s) => s.project?.settings?.coloredRows ?? DEFAULT_PROJECT_SETTINGS.coloredRows
  );

  const gestures = useScheduleRowGestures(section.id, viewport, pixelsPerDay);
  // The band stands in for a schedule whose rows have scrolled away, so a drop
  // aimed at it has nowhere else to show
  const isHeaderTarget = useIsDropHeader(section.id);

  const sticky = useMemo((): StickyMilestoneData[] => {
    return headerMilestones(section).map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      left: dayToX(milestone.start, viewport, pixelsPerDay),
      item: milestone,
    }));
  }, [section, viewport, pixelsPerDay]);

  // The band stands in for one schedule's row, so it wears that schedule's tint.
  const tint = sectionTintColor(section.color, section.isMulticolor, coloredRows);

  const labelPlacements = useMemo(
    () =>
      layoutLabels(
        sticky.map((milestone) => ({
          id: milestone.id,
          center: milestone.left,
          width: measureMilestoneLabelWidth(milestone.name),
        }))
      ),
    [sticky]
  );

  return (
    <div
      className="sticky z-40 border-t border-[var(--color-hairline)] bg-[var(--color-background)]"
      style={{
        top: stickySlotTop(slot),
        height: STICKY_SLOT_HEIGHT,
        marginBottom: -STICKY_SLOT_HEIGHT,
      }}
    >
      {/* The row's own surface. Everything ruled through the band sits over it
          and takes no pointer events, so `e.target === e.currentTarget` still
          means "open paper" here exactly as it does on the sheet — and a drop
          lands in the schedule whose band you aimed at, not in whichever rows
          happen to have scrolled underneath it. */}
      <div
        ref={gestures.rowRef}
        className={`relative timeline-plot schedule-block ${
          gestures.ghostX !== null ? 'cursor-copy' : ''
        } ${isHeaderTarget ? 'drop-header--receiving' : ''} ${
          isLifted ? 'schedule-block--lifted' : ''
        }`}
        style={{ height: ROW_HEIGHT }}
        data-drop-header={section.id}
        data-drop-section={section.id}
        data-drop-sticky=""
        data-drop-slot-locked={section.isLocked ? '' : undefined}
        onClick={gestures.handleClick}
        onDoubleClick={gestures.handleDoubleClick}
        onContextMenu={gestures.handleContextMenu}
        onPointerMove={gestures.handlePointerMove}
        onPointerLeave={gestures.handlePointerLeave}
      >
        {tint && (
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundColor: tint }} />
        )}
        <TimelineGrid height={ROW_HEIGHT} />
        <MilestoneLines
          milestones={pinnedMarkers}
          viewport={viewport}
          pixelsPerDay={pixelsPerDay}
          top={0}
          height={ROW_HEIGHT}
        />
        <CollapsedBars section={section} viewport={viewport} pixelsPerDay={pixelsPerDay} />

        <TodayLine viewport={viewport} pixelsPerDay={pixelsPerDay} height={ROW_HEIGHT} />

        {/* The schedule's rows are elsewhere on the sheet, so the ghost shows
            the marker alone — a preview line dropped from here would rule
            through whatever happens to have scrolled underneath. */}
        {gestures.ghostX !== null &&
          (gestures.isTaskGhost ? (
            <GhostTask left={gestures.ghostX} />
          ) : (
            <GhostMilestone x={gestures.ghostX} lineHeight={0} />
          ))}

        {sticky.map((milestone) => (
          <StickyMilestone
            key={milestone.id}
            item={milestone.item}
            section={section}
            left={milestone.left}
            pixelsPerDay={pixelsPerDay}
            isSelected={selectedId === milestone.id}
            labelPlacement={labelPlacements.get(milestone.id)}
          />
        ))}
      </div>
    </div>
  );
}
