import type { Phase, Section } from './timeline';
import { getPhaseColorInRange } from '../utils/colorUtils';
import { getNextPhaseColor } from '../constants/colors';

/**
 * Get the effective display color for a phase.
 * If the phase has an explicit color, use it.
 * In multicolor schedules, fall back to the palette color for the phase's position.
 * If index info is provided, compute a gradient color from the section's base color.
 * Otherwise, fall back to the section color.
 */
export function getPhaseColor(
  phase: Phase,
  section: Section,
  phaseIndex?: number,
  totalPhases?: number
): string {
  if (phase.color) {
    return phase.color;
  }

  if (section.isMulticolor) {
    return getNextPhaseColor(phaseIndex ?? phase.order);
  }

  if (phaseIndex !== undefined && totalPhases !== undefined && totalPhases > 1) {
    return getPhaseColorInRange(section.color, phaseIndex, totalPhases);
  }

  return section.color;
}
