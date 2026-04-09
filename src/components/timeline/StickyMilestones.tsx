import { useMemo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../../utils/timelineUtils';
import { sectionToViewportRelative } from '../../utils/dateUtils';

interface StickyMilestonesProps {
  readonly sections: Section[];
  readonly stickyMilestoneIds: ReadonlySet<string>;
  readonly timelineWidth: number;
  readonly viewportBounds: ViewportBounds;
}

interface StickyMilestoneData {
  readonly milestoneId: string;
  readonly milestoneName: string;
  readonly sectionId: string;
  readonly left: number;
  readonly isSelected: boolean;
}

export function StickyMilestones({
  sections,
  stickyMilestoneIds,
  timelineWidth,
  viewportBounds,
}: StickyMilestonesProps) {
  const { selection, selectItem, openContextMenu } = useUIStore();

  // Collect milestone render data for those that are currently sticky
  const stickyMilestones = useMemo(() => {
    if (stickyMilestoneIds.size === 0) return [];

    const result: StickyMilestoneData[] = [];
    for (const section of sections) {
      for (const milestone of section.milestones) {
        if (!stickyMilestoneIds.has(milestone.id)) continue;

        const viewportPosition = sectionToViewportRelative(
          milestone.relativePosition,
          section,
          viewportBounds
        );
        const left = viewportPosition * timelineWidth;

        result.push({
          milestoneId: milestone.id,
          milestoneName: milestone.name,
          sectionId: section.id,
          left,
          isSelected: selection.type === 'milestone' && selection.id === milestone.id,
        });
      }
    }

    return result;
  }, [sections, stickyMilestoneIds, timelineWidth, viewportBounds, selection.type, selection.id]);

  // Don't render anything if no sticky milestones
  if (stickyMilestones.length === 0) {
    return null;
  }

  return (
    <div
      className="sticky z-40 pointer-events-none"
      style={{ top: HEADER_HEIGHT, height: ROW_HEIGHT, marginBottom: -ROW_HEIGHT }}
    >
      {stickyMilestones.map((milestone) => (
        <div
          key={milestone.milestoneId}
          className="absolute pointer-events-auto cursor-pointer group"
          style={{
            left: milestone.left,
            top: 0,
            height: ROW_HEIGHT,
          }}
          onClick={(e) => {
            e.stopPropagation();
            selectItem('milestone', milestone.milestoneId, milestone.sectionId, null, {
              x: e.clientX,
              y: e.clientY,
            });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openContextMenu(
              { x: e.clientX, y: e.clientY },
              'milestone',
              milestone.milestoneId,
              milestone.sectionId
            );
          }}
          role="button"
          tabIndex={0}
          aria-label={`${milestone.milestoneName} milestone (sticky)`}
        >
          {/* Diamond marker */}
          <div
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 ${
              milestone.isSelected ? 'scale-125' : 'hover:scale-110'
            }`}
          >
            <div
              className={`w-3 h-3 rotate-45 ${
                milestone.isSelected
                  ? 'bg-[var(--color-focus)] ring-2 ring-[var(--color-focus)]/40'
                  : 'bg-[var(--color-text-primary)]'
              }`}
            />
          </div>

          {/* Short vertical line */}
          <div
            className={`absolute top-1/2 left-0 -translate-x-1/2 w-0.5 h-3 ${
              milestone.isSelected
                ? 'bg-[var(--color-focus)]'
                : 'bg-[var(--color-text-primary)]'
            }`}
          />

          {/* Title label */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-2 px-2 py-0.5 bg-[var(--color-surface)]/90 backdrop-blur-[2px] text-[var(--color-text-primary)] text-xs rounded-md whitespace-nowrap pointer-events-none border border-[var(--color-border)]">
            {milestone.milestoneName}
          </div>
        </div>
      ))}
    </div>
  );
}
