import { useMemo } from 'react';
import type { Section, TimelineItem, ViewportBounds } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { HEADER_HEIGHT, ROW_HEIGHT, dayToX, headerMilestones } from '../../utils/timelineUtils';
import { layoutLabels, measureMilestoneLabelWidth } from '../../utils/labelLayoutUtils';
import { sectionTintColor } from '../../utils/colorUtils';
import { MilestoneGlyph } from './MilestoneGlyph';
import { MilestoneLabel } from './MilestoneLabel';
import { MilestoneLines } from './MilestoneLines';
import { TimelineGrid } from './TimelineGrid';
import { TodayLine } from './TodayLine';

interface StickyScheduleRowProps {
  /** The schedule currently held under the axis, or null when none is. */
  readonly section: Section | null;
  /** The pinned schedule's markers — their lines rule through this band too. */
  readonly pinnedMarkers: readonly TimelineItem[];
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
}

interface StickyMilestoneData {
  readonly id: string;
  readonly name: string;
  readonly left: number;
}

/**
 * A schedule's own row, held under the date axis while its items scroll past —
 * the timeline half of it. `StickyScheduleLabel` holds the other half, in the
 * labels column, off the same schedule.
 *
 * The band stands in for that row, so it is that row: it carries the same tint
 * and the sheet's rules pass through it — gridlines, today, and the pinned
 * schedule's reference lines. Paper laid over them would cut every vertical on
 * the sheet at the same height, which reads as a seam.
 */
export function StickyScheduleRow({
  section,
  pinnedMarkers,
  viewport,
  pixelsPerDay,
}: StickyScheduleRowProps): JSX.Element | null {
  const selectedId = useUIStore((s) => (s.selection.type === 'item' ? s.selection.id : null));
  const selectItem = useUIStore((s) => s.selectItem);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const coloredRows = useProjectStore(
    (s) => s.project?.settings?.coloredRows ?? DEFAULT_PROJECT_SETTINGS.coloredRows
  );

  const sticky = useMemo((): StickyMilestoneData[] => {
    if (!section) return [];
    return headerMilestones(section).map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      left: dayToX(milestone.start, viewport, pixelsPerDay),
    }));
  }, [section, viewport, pixelsPerDay]);

  // The band stands in for one schedule's row, so it wears that schedule's tint.
  const tint = section ? sectionTintColor(section.color, section.isMulticolor, coloredRows) : null;

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

  if (!section) return null;

  return (
    <div
      className="sticky z-40 pointer-events-none bg-[var(--color-background)]"
      style={{ top: HEADER_HEIGHT, height: ROW_HEIGHT, marginBottom: -ROW_HEIGHT }}
    >
      {tint && <div className="absolute inset-0" style={{ backgroundColor: tint }} />}
      <TimelineGrid height={ROW_HEIGHT} />
      <MilestoneLines
        milestones={pinnedMarkers}
        viewport={viewport}
        pixelsPerDay={pixelsPerDay}
        top={0}
        height={ROW_HEIGHT}
      />
      <TodayLine viewport={viewport} pixelsPerDay={pixelsPerDay} height={ROW_HEIGHT} />

      {sticky.map((milestone) => (
        <div
          key={milestone.id}
          className="absolute hover:z-10 pointer-events-auto cursor-pointer group"
          style={{ left: milestone.left, top: 0, height: ROW_HEIGHT }}
          onClick={(e) => {
            e.stopPropagation();
            selectItem(milestone.id, section.id, { x: e.clientX, y: e.clientY });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openContextMenu({
              position: { x: e.clientX, y: e.clientY },
              targetType: 'item',
              targetId: milestone.id,
              sectionId: section.id,
              location: 'bar',
            });
          }}
          role="button"
          tabIndex={0}
          aria-label={`${milestone.name} milestone (sticky)`}
        >
          <MilestoneGlyph isSelected={selectedId === milestone.id} />
          <MilestoneLabel
            name={milestone.name}
            placement={labelPlacements.get(milestone.id)}
            forceVisible={selectedId === milestone.id}
          />
        </div>
      ))}
    </div>
  );
}
