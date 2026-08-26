import { memo } from 'react';
import type { TimelineItem, ViewportBounds } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { dayToX } from '../../utils/timelineUtils';

interface MilestoneLinesProps {
  readonly milestones: readonly TimelineItem[];
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  /** Where the lines start, measured from the top of the positioned parent. */
  readonly top: number;
  /** How far they run down the sheet. */
  readonly height: number;
  /** Extra classes on the layer — the sheet-long layer lifts itself above the
      schedules' tinted grounds with a `z-10` here. */
  readonly className?: string;
}

/**
 * The reference lines a schedule's root milestones rule down the sheet — the
 * whole sheet for the pinned schedule, its own rows for every other one.
 *
 * A line hides until its own marker is hovered or selected — same hover
 * signal (and linger) `HeaderMilestone` already reports for dependency dots,
 * so no new gesture is needed. Printed all the time, the lines read as rules
 * on the paper; revealed one at a time, each is legible evidence for the
 * marker someone is actually looking at.
 *
 * They are a layer of their own rather than something each marker carries.
 * A marker hides once it is promoted to the sticky strip, and the line has to
 * outlive that: reading the rows below against it is the reason the schedule
 * was scrolled under the axis in the first place. Drawing them in one place
 * also keeps the pinned schedule's lines from being printed twice — once by
 * the sheet-long layer and once by the marker — over its own rows.
 */
export const MilestoneLines = memo(function MilestoneLines({
  milestones,
  viewport,
  pixelsPerDay,
  top,
  height,
  className,
}: MilestoneLinesProps): JSX.Element | null {
  const hoverItemId = useUIStore((s) => s.dependencyHoverItemId);
  const selectedItemId = useUIStore((s) =>
    s.selection.type === 'item' ? s.selection.id : null
  );

  if (milestones.length === 0 || height <= 0) return null;

  const revealed = milestones.filter(
    (milestone) => milestone.id === hoverItemId || milestone.id === selectedItemId
  );
  if (revealed.length === 0) return null;

  return (
    <div
      className={`absolute inset-x-0 pointer-events-none ${className ?? ''}`}
      style={{ top }}
      aria-hidden="true"
    >
      {revealed.map((milestone) => (
        <div
          key={milestone.id}
          className="absolute top-0 w-px bg-[var(--color-milestone-line)]"
          style={{ left: dayToX(milestone.start, viewport, pixelsPerDay), height }}
        />
      ))}
    </div>
  );
});
