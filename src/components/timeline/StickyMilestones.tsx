import { useMemo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../../utils/timelineUtils';
import { sectionToViewportRelative } from '../../utils/dateUtils';
import { layoutLabels, measureMilestoneLabelWidth } from '../../utils/labelLayoutUtils';
import { MilestoneGlyph } from './MilestoneGlyph';
import { MilestoneLabel } from './MilestoneLabel';

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
}: StickyMilestonesProps): JSX.Element | null {
  const selection = useUIStore((s) => s.selection);
  const selectItem = useUIStore((s) => s.selectItem);
  const openContextMenu = useUIStore((s) => s.openContextMenu);

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

  // Sticky labels share one row, so they need the same collision layout
  const labelPlacements = useMemo(
    () =>
      layoutLabels(
        stickyMilestones.map((milestone) => ({
          id: milestone.milestoneId,
          center: milestone.left,
          width: measureMilestoneLabelWidth(milestone.milestoneName),
        }))
      ),
    [stickyMilestones]
  );

  // Don't render anything if no sticky milestones
  if (stickyMilestones.length === 0) {
    return null;
  }

  return (
    <div
      className="sticky z-40 pointer-events-none bg-[var(--color-background)]"
      style={{ top: HEADER_HEIGHT, height: ROW_HEIGHT, marginBottom: -ROW_HEIGHT }}
    >
      {stickyMilestones.map((milestone) => (
        <div
          key={milestone.milestoneId}
          className="absolute hover:z-10 pointer-events-auto cursor-pointer group"
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
          <MilestoneGlyph isSelected={milestone.isSelected} />
          <MilestoneLabel
            name={milestone.milestoneName}
            placement={labelPlacements.get(milestone.milestoneId)}
            forceVisible={milestone.isSelected}
          />
        </div>
      ))}
    </div>
  );
}
