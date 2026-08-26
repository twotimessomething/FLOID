// Phase color gradient configuration
export const HUE_SHIFT = 12; // Degrees to shift hue across range
export const LIGHTNESS_SHIFT = -10; // Percentage to adjust lightness

/**
 * The FLOID palette.
 *
 * Flat, printed-ink colors sampled from mid-century data-visualization work:
 * saturated mid-tones alternating with tints so adjacent phases separate on
 * value as well as hue. Bars are opaque ink on a grey ground and carry their
 * names, so every colour here has to hold a label in either theme.
 *
 * Listed as a walk around the wheel — warm through green to sky, then blues
 * through magenta — with each family's members adjacent and its tint beside
 * its mid-tone. That is the order the swatch grids draw, so the picker reads
 * as a printed colour card rather than a bag of hues. It is deliberately *not*
 * the order a multicolor schedule rotates through: see MULTICOLOR_SEQUENCE.
 *
 * Every entry survives its own gradient ramp without flipping label colour
 * halfway down — the check that rules out an olive one stop darker than moss.
 */
export const PHASE_COLORS = {
  red: '#F34E42',
  orange: '#EA733E',
  clay: '#9E5A3C',
  ochre: '#E0B54A',
  moss: '#8FAE55',
  mint: '#BFE7B9',
  teal: '#5BB5A9',
  sky: '#B1E3F9',
  blue: '#3264B3',
  indigo: '#3A3F76',
  violet: '#6A4C93',
  pink: '#F1B5D4',
  plum: '#7A184B',
} as const;

/** Every ink in the palette, in swatch order. What the pickers offer. */
export const PALETTE_COLORS: readonly string[] = Object.values(PHASE_COLORS);

/**
 * The order a multicolor schedule hands colours to its root bars.
 *
 * Value alternation is the job here, not hue order: consecutive root bars have
 * to separate on lightness as well as hue, so a mid-tone is followed by a tint
 * or a dark rather than by its own neighbour on the wheel.
 *
 * The first nine entries are frozen. A multicolor schedule stores no colours —
 * they are resolved from position — so reordering this list repaints saved
 * projects. New inks are appended, which leaves every existing schedule of
 * nine root bars or fewer looking exactly as it did.
 */
export const MULTICOLOR_SEQUENCE: readonly string[] = [
  PHASE_COLORS.teal,
  PHASE_COLORS.sky,
  PHASE_COLORS.blue,
  PHASE_COLORS.red,
  PHASE_COLORS.pink,
  PHASE_COLORS.orange,
  PHASE_COLORS.indigo,
  PHASE_COLORS.ochre,
  PHASE_COLORS.plum,
  PHASE_COLORS.moss,
  PHASE_COLORS.mint,
  PHASE_COLORS.violet,
  PHASE_COLORS.clay,
];

// Schedule base colors — mid-value hues that hold up under the per-phase
// gradient shift. Tints are placed last so they are picked only when needed.
// A schedule stores the colour it was given, so this order only ever decides
// what a *new* schedule starts as.
export const SCHEDULE_COLORS = [
  PHASE_COLORS.teal,
  PHASE_COLORS.blue,
  PHASE_COLORS.orange,
  PHASE_COLORS.indigo,
  PHASE_COLORS.red,
  PHASE_COLORS.plum,
  PHASE_COLORS.ochre,
  PHASE_COLORS.moss,
  PHASE_COLORS.violet,
  PHASE_COLORS.clay,
  PHASE_COLORS.sky,
  PHASE_COLORS.mint,
  PHASE_COLORS.pink,
];

export const getScheduleColor = (index: number): string => {
  return SCHEDULE_COLORS[index % SCHEDULE_COLORS.length];
};

export const getNextPhaseColor = (existingCount: number): string => {
  return MULTICOLOR_SEQUENCE[existingCount % MULTICOLOR_SEQUENCE.length];
};

// Conic gradient swatch representing the multicolor phase palette
export const MULTICOLOR_GRADIENT = `conic-gradient(${MULTICOLOR_SEQUENCE.join(', ')}, ${
  MULTICOLOR_SEQUENCE[0]
})`;

/** Whether a colour is one of the palette's own inks (as opposed to a custom pick). */
export const isPaletteColor = (color: string): boolean =>
  PALETTE_COLORS.some((ink) => ink.toLowerCase() === color.toLowerCase());
