import { memo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { sectionToViewportRelative } from '../../utils/dateUtils';

interface PinnedMilestoneLinesProps {
  readonly section: Section;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
  readonly height: number;
}

/**
 * Full-height reference lines for the pinned schedule's milestones,
 * extending through every schedule on the timeline.
 */
export const PinnedMilestoneLines = memo(function PinnedMilestoneLines({
  section,
  timelineWidth,
  viewportBounds,
  height,
}: PinnedMilestoneLinesProps): JSX.Element | null {
  if (section.milestones.length === 0) return null;

  return (
    <div className="absolute inset-x-0 top-0 pointer-events-none" aria-hidden="true">
      {section.milestones.map((milestone) => {
        const viewportPosition = sectionToViewportRelative(
          milestone.relativePosition,
          section,
          viewportBounds
        );
        return (
          <div
            key={milestone.id}
            className="absolute top-0 w-px bg-[var(--color-milestone-line)]"
            style={{ left: viewportPosition * timelineWidth, height }}
          />
        );
      })}
    </div>
  );
});
