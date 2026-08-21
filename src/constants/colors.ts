// Phase color gradient configuration
export const HUE_SHIFT = 12; // Degrees to shift hue across range
export const LIGHTNESS_SHIFT = -10; // Percentage to adjust lightness

/**
 * The FLOID palette.
 *
 * Flat, printed-ink colors sampled from mid-century data-visualization work:
 * saturated mid-tones alternating with tints so adjacent phases separate on
 * value as well as hue. Bars multiply over the grey ground, so every colour
 * here is chosen to stay legible after that darkening.
 */
export const PHASE_COLORS = {
  teal: '#5BB5A9',
  sky: '#B1E3F9',
  blue: '#3264B3',
  red: '#F34E42',
  pink: '#F1B5D4',
  orange: '#EA733E',
  indigo: '#3A3F76',
  ochre: '#E0B54A',
  plum: '#7A184B',
} as const;

// Schedule base colors — mid-value hues that hold up under the per-phase
// gradient shift. Tints are placed last so they are picked only when needed.
export const SCHEDULE_COLORS = [
  PHASE_COLORS.teal,
  PHASE_COLORS.blue,
  PHASE_COLORS.orange,
  PHASE_COLORS.indigo,
  PHASE_COLORS.red,
  PHASE_COLORS.plum,
  PHASE_COLORS.ochre,
  PHASE_COLORS.sky,
];

export const getScheduleColor = (index: number): string => {
  return SCHEDULE_COLORS[index % SCHEDULE_COLORS.length];
};

export const getNextPhaseColor = (existingCount: number): string => {
  const colorKeys = Object.keys(PHASE_COLORS) as (keyof typeof PHASE_COLORS)[];
  const colorIndex = existingCount % colorKeys.length;
  return PHASE_COLORS[colorKeys[colorIndex]];
};

// Conic gradient swatch representing the multicolor phase palette
export const MULTICOLOR_GRADIENT = `conic-gradient(${Object.values(PHASE_COLORS).join(', ')}, ${
  Object.values(PHASE_COLORS)[0]
})`;
