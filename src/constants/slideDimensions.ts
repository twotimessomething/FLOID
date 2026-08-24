/**
 * The sheet a timeline prints onto when it becomes a slide.
 *
 * A 16:9 PowerPoint slide is 13.333in x 7.5in. Everything here is measured in
 * points instead, so geometry and type sizes share one unit and the planner
 * never does inch arithmetic; the renderer divides by `POINTS_PER_INCH` on the
 * way out and that is the only place inches appear.
 */

export const POINTS_PER_INCH = 72;

export const SLIDE_WIDTH_PT = 960;
export const SLIDE_HEIGHT_PT = 540;

export const SLIDE_MARGIN_X = 28;
export const SLIDE_MARGIN_TOP = 22;
export const SLIDE_MARGIN_BOTTOM = 20;

/** Project name band, above the axis. */
export const SLIDE_TITLE_HEIGHT = 22;
/** Month marks under the title. */
export const SLIDE_AXIS_HEIGHT = 16;
/** Left column: schedule and item names. */
export const SLIDE_LABEL_WIDTH = 148;

/**
 * Row heights before the fit-to-slide squeeze, in the same two-step ladder the
 * screen uses: a schedule's own row, a root item's row, everything below it.
 */
export const SLIDE_SCHEDULE_ROW = 26;
export const SLIDE_ROOT_ROW = 24;
export const SLIDE_NESTED_ROW = 16;

/** Air between one schedule's last row and the next schedule's name. */
export const SLIDE_SECTION_GAP = 9;

/**
 * One slide is the hard constraint, so rows are squeezed as far as they need
 * to be — but a short timeline is not stretched past this, or three bars would
 * print as three stripes.
 */
export const SLIDE_MAX_SCALE = 1.35;

/** Under this the squeeze has gone far enough that the export is worth flagging. */
export const SLIDE_TIGHT_SCALE = 0.55;

export const SLIDE_MIN_FONT_PT = 5;
export const SLIDE_MAX_FONT_PT = 12;

/** A bar narrower than this has nowhere to print its name. */
export const SLIDE_MIN_LABEL_WIDTH = 18;

/** Horizontal run a dependency connector takes before its first corner. */
export const SLIDE_DEP_STUB = 7;

/**
 * Ink. Fixed, not read from CSS variables: an export made in dark mode should
 * still arrive as a slide someone can project, and item colours come from the
 * data rather than the theme in any case.
 */
export const SLIDE_INK = {
  paper: 'FFFFFF',
  title: '17171A',
  label: '3F3F45',
  muted: '86868C',
  gridline: 'E8E8E8',
  hairline: 'D8D8DC',
  milestoneLine: 'C9C9CE',
  today: 'F34E42',
  dependency: 'A8A8AE',
  dependencyViolated: 'F34E42',
} as const;

/** Present on every machine a deck lands on, unlike the app's system-ui stack. */
export const SLIDE_FONT = 'Arial';
