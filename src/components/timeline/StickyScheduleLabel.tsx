import type { Section } from '../../types';
import { DEFAULT_PROJECT_SETTINGS } from '../../types';
import { useProjectStore } from '../../stores/projectStore';
import { STICKY_SLOT_HEIGHT, stickySlotTop } from '../../utils/timelineUtils';
import { sectionTintColor } from '../../utils/colorUtils';
import { ScheduleLabelRow } from './ScheduleLabelRow';

interface StickyScheduleLabelProps {
  /** A schedule held under the axis. */
  readonly section: Section;
  /** Its slot in the held stack — the same one its band takes on the timeline. */
  readonly slot: number;
  /** The schedule is in the hand: its name drains here as it does on the sheet. */
  readonly isLifted?: boolean;
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
 * markers belongs to which schedule. Each band carries the hairline its
 * schedule prints under, so the stack keeps the separators the sheet has.
 */
export function StickyScheduleLabel({
  section,
  slot,
  isLifted = false,
}: StickyScheduleLabelProps): JSX.Element {
  const coloredRows = useProjectStore(
    (s) => s.project?.settings?.coloredRows ?? DEFAULT_PROJECT_SETTINGS.coloredRows
  );

  const tint = sectionTintColor(section.color, section.isMulticolor, coloredRows);

  return (
    <div
      className="absolute inset-x-0 z-10 border-t border-[var(--color-hairline)] bg-[var(--color-background)]"
      style={{ top: stickySlotTop(slot), height: STICKY_SLOT_HEIGHT }}
      data-sticky-label={section.id}
    >
      {tint && <div className="absolute inset-0" style={{ backgroundColor: tint }} />}
      {/* The band's paper stays opaque — rows scroll beneath it — so only
          what is printed on it drains */}
      <div className={`relative schedule-block ${isLifted ? 'schedule-block--lifted' : ''}`}>
        <ScheduleLabelRow section={section} isSticky />
      </div>
    </div>
  );
}
