import { useMemo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import { useUIStore } from '../../stores/uiStore';
import { HEADER_HEIGHT, ROW_HEIGHT, dayToX, headerMilestones } from '../../utils/timelineUtils';
import { layoutLabels, measureMilestoneLabelWidth } from '../../utils/labelLayoutUtils';
import { MilestoneGlyph } from './MilestoneGlyph';
import { MilestoneLabel } from './MilestoneLabel';

interface StickyMilestonesProps {
  readonly sections: readonly Section[];
  readonly stickyMilestoneIds: ReadonlySet<string>;
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
}

interface StickyMilestoneData {
  readonly id: string;
  readonly name: string;
  readonly sectionId: string;
  readonly left: number;
}

/**
 * A schedule's milestones stay legible while its rows scroll under the axis:
 * once the header row leaves the top of the viewport, its markers reappear here.
 */
export function StickyMilestones({
  sections,
  stickyMilestoneIds,
  viewport,
  pixelsPerDay,
}: StickyMilestonesProps): JSX.Element | null {
  const selectedId = useUIStore((s) => (s.selection.type === 'item' ? s.selection.id : null));
  const selectItem = useUIStore((s) => s.selectItem);
  const openContextMenu = useUIStore((s) => s.openContextMenu);

  const sticky = useMemo(() => {
    if (stickyMilestoneIds.size === 0) return [] as StickyMilestoneData[];
    const result: StickyMilestoneData[] = [];
    for (const section of sections) {
      for (const milestone of headerMilestones(section)) {
        if (!stickyMilestoneIds.has(milestone.id)) continue;
        result.push({
          id: milestone.id,
          name: milestone.name,
          sectionId: section.id,
          left: dayToX(milestone.start, viewport, pixelsPerDay),
        });
      }
    }
    return result;
  }, [sections, stickyMilestoneIds, viewport, pixelsPerDay]);

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

  if (sticky.length === 0) return null;

  return (
    <div
      className="sticky z-40 pointer-events-none bg-[var(--color-background)]"
      style={{ top: HEADER_HEIGHT, height: ROW_HEIGHT, marginBottom: -ROW_HEIGHT }}
    >
      {sticky.map((milestone) => (
        <div
          key={milestone.id}
          className="absolute hover:z-10 pointer-events-auto cursor-pointer group"
          style={{ left: milestone.left, top: 0, height: ROW_HEIGHT }}
          onClick={(e) => {
            e.stopPropagation();
            selectItem(milestone.id, milestone.sectionId, { x: e.clientX, y: e.clientY });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openContextMenu({
              position: { x: e.clientX, y: e.clientY },
              targetType: 'item',
              targetId: milestone.id,
              sectionId: milestone.sectionId,
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
