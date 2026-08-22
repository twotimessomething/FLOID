import type { Section } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { useProjectStore } from '../../stores/projectStore';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../../utils/timelineUtils';
import { sectionTintColor } from '../../utils/colorUtils';
import { ScheduleLabelRow } from './ScheduleLabelRow';

interface StickyScheduleLabelProps {
  /** A schedule held under the axis. */
  readonly section: Section;
  /** Its slot in the held stack — the same one its band takes on the timeline. */
  readonly slot: number;
}

/**
 * The labels half of a held schedule row: its name stays put under the axis
 * while its items scroll past, opposite its markers in `StickyScheduleRow`.
 * Both halves are the same row, so this one is the real label component — the
 * chevron collapses, a double-click renames, the schedule can still be
 * selected from here.
 *
 * Held schedules stack, so this reads down the column in the order they were
 * scrolled past — which is the only thing that says which stacked band of
 * markers belongs to which schedule.
 */
export function StickyScheduleLabel({ section, slot }: StickyScheduleLabelProps): JSX.Element {
  const coloredRows = useProjectStore(
    (s) => s.project?.settings?.coloredRows ?? DEFAULT_PROJECT_SETTINGS.coloredRows
  );

  const tint = sectionTintColor(section.color, section.isMulticolor, coloredRows);

  return (
    <div
      className="absolute inset-x-0 z-10 bg-[var(--color-background)]"
      style={{ top: HEADER_HEIGHT + slot * ROW_HEIGHT, height: ROW_HEIGHT }}
    >
      {tint && <div className="absolute inset-0" style={{ backgroundColor: tint }} />}
      <div className="relative">
        <ScheduleLabelRow section={section} />
      </div>
    </div>
  );
}
