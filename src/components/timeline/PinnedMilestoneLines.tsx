import { memo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { dayToX, headerMilestones } from '../../utils/timelineUtils';

interface PinnedMilestoneLinesProps {
  readonly section: Section;
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  readonly height: number;
}

/**
 * Reference lines for the pinned schedule's own milestones, drawn the full
 * height of the sheet so every other schedule can be read against them.
 */
export const PinnedMilestoneLines = memo(function PinnedMilestoneLines({
  section,
  viewport,
  pixelsPerDay,
  height,
}: PinnedMilestoneLinesProps): JSX.Element | null {
  const milestones = headerMilestones(section);
  if (milestones.length === 0) return null;

  return (
    <div className="absolute inset-x-0 top-0 pointer-events-none" aria-hidden="true">
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
