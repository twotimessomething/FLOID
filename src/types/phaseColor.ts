import type { Phase, Section } from './timeline';
import { getPhaseColorInRange } from '../utils/colorUtils';

/**
 * Get the effective display color for a phase.
 * If the phase has an explicit color, use it.
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

  if (phaseIndex !== undefined && totalPhases !== undefined && totalPhases > 1) {
    return getPhaseColorInRange(section.color, phaseIndex, totalPhases);
  }

  return section.color;
}
