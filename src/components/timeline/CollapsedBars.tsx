import { useMemo } from 'react';
import type { Section, ViewportBounds } from '../../types';
import {
  COLLAPSED_TAPE_HEIGHT,
  COLLAPSED_TAPE_TOP,
  dayToX,
  getBarRect,
  tapeStrips,
} from '../../utils/timelineUtils';
import { getReadableTextColor } from '../../utils/colorUtils';

interface CollapsedBarsProps {
  readonly section: Section;
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
}

/**
 * A collapsed schedule's root bars, folded onto its own row as a tape across
 * the row's upper half.
 *
 * The tape is the shape of the work rather than the work itself: a collapsed
 * bar has no edge to drag and no children to open, so it is ink to read and
 * takes no pointer events at all.
 *
 * Strips of paper, laid down in date order — the later one covers the one
 * before it, and carries a hairline of paper at each end so you can always see
 * where one bar stops and the next starts. Nothing blends: overprinting three
 * bars that share a week only ever produced black. `tapeStrips` owns the order
 * and decides where each name still has room to print.
 *
 * It stops short of the row's floor on purpose. The markers on this row keep
 * the lower half, so their names print on the ground underneath instead of over
 * a colour they cannot be read against — and, just as much, so a diamond no
 * longer sits on the same line as a bar's name. Full height, the two ran
 * together: markers gather at the edges where one bar meets the next, and
 * "◆ EVT" read as a single label rather than a marker beside a phase that
 * happens to start there.
 *
 * Drawn twice — here on the sheet, and again in the band that holds a collapsed
 * schedule under the axis — so neither can be a copy of the other.
 */
export function CollapsedBars({
  section,
  viewport,
  pixelsPerDay,
}: CollapsedBarsProps): JSX.Element | null {
  const strips = useMemo(() => tapeStrips(section), [section]);

  if (!section.isCollapsed) return null;

  return (
    <>
      {strips.map(({ item, color, coveredFrom }) => {
        const rect = getBarRect(item, viewport, pixelsPerDay);
        const labelWidth =
          coveredFrom === null
            ? undefined
            : Math.max(0, dayToX(coveredFrom, viewport, pixelsPerDay) - rect.left);
        return (
          <div
            key={item.id}
            className="absolute timeline-bar timeline-tape-bar pointer-events-none"
            style={{
              left: rect.left,
              width: rect.width,
              top: COLLAPSED_TAPE_TOP,
              height: COLLAPSED_TAPE_HEIGHT,
            }}
            aria-hidden="true"
          >
            <div className="timeline-bar__fill" style={{ backgroundColor: color }} />
            <span className="timeline-bar__label" style={{ maxWidth: labelWidth }}>
              <span className="truncate" style={{ color: getReadableTextColor(color) }}>
                {item.name}
              </span>
            </span>
          </div>
        );
      })}
    </>
  );
}
