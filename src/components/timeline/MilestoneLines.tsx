import { memo } from 'react';
import type { TimelineItem, ViewportBounds } from '../../types';
import { dayToX } from '../../utils/timelineUtils';

interface MilestoneLinesProps {
  readonly milestones: readonly TimelineItem[];
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  /** Where the lines start, measured from the top of the positioned parent. */
  readonly top: number;
  /** How far they run down the sheet. */
  readonly height: number;
}

/**
 * The reference lines a schedule's root milestones rule down the sheet — the
 * whole sheet for the pinned schedule, its own rows for every other one.
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
}: MilestoneLinesProps): JSX.Element | null {
  if (milestones.length === 0 || height <= 0) return null;

  return (
    <div className="absolute inset-x-0 pointer-events-none" style={{ top }} aria-hidden="true">
      {milestones.map((milestone) => (
        <div
          key={milestone.id}
          className="absolute top-0 w-px bg-[var(--color-milestone-line)]"
          style={{ left: dayToX(milestone.start, viewport, pixelsPerDay), height }}
        />
      ))}
    </div>
  );
});
