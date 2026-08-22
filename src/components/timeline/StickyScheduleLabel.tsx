import type { Section } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { useProjectStore } from '../../stores/projectStore';
import { HEADER_HEIGHT, ROW_HEIGHT } from '../../utils/timelineUtils';
import { sectionTintColor } from '../../utils/colorUtils';
import { ScheduleLabelRow } from './ScheduleLabelRow';

interface StickyScheduleLabelProps {
  /** The schedule currently held under the axis, or null when none is. */
  readonly section: Section | null;
}

/**
 * The labels half of the held schedule row: its name stays put under the axis
 * while its items scroll past, opposite its markers in `StickyScheduleRow`.
 * Both halves are the same row, so this one is the real label component — the
 * chevron collapses, a double-click renames, the schedule can still be
 * selected from here.
 */
export function StickyScheduleLabel({ section }: StickyScheduleLabelProps): JSX.Element | null {
  const coloredRows = useProjectStore(
    (s) => s.project?.settings?.coloredRows ?? DEFAULT_PROJECT_SETTINGS.coloredRows
  );

  if (!section) return null;

  const tint = sectionTintColor(section.color, section.isMulticolor, coloredRows);

  return (
    <div
      className="absolute inset-x-0 z-10 bg-[var(--color-background)]"
      style={{ top: HEADER_HEIGHT, height: ROW_HEIGHT }}
    >
      {tint && <div className="absolute inset-0" style={{ backgroundColor: tint }} />}
      <div className="relative">
        <ScheduleLabelRow section={section} />
      </div>
    </div>
  );
}
