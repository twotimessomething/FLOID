import type { Section, TimelineItem } from './timeline';
import { getPhaseColorInRange } from '../utils/colorUtils';
import { getNextPhaseColor } from '../constants/colors';

/**
 * The colour an item paints with.
 *
 * An explicit colour always wins. Otherwise a root item takes its colour from
 * the schedule — a palette entry when the schedule is multicolour, a step along
 * a gradient of the schedule colour otherwise — and a nested item inherits
 * whatever its parent resolved to. Inheriting rather than re-deriving is what
 * keeps a group reading as one block after it has been dragged somewhere new.
 */
export function getItemColor(
  item: TimelineItem,
  section: Section,
  rootIndex: number,
  rootCount: number,
  inherited?: string
): string {
  if (item.color) return item.color;
  if (inherited) return inherited;

  if (section.isMulticolor) {
    return getNextPhaseColor(rootIndex);
  }

  if (rootCount > 1) {
    return getPhaseColorInRange(section.color, rootIndex, rootCount);
  }

  return section.color;
}
