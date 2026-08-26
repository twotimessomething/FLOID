import type { Project } from '../types/project';
import type { DependencyAnchor, DependencyEdge, Section, TimelineItem } from '../types/timeline';
import { flattenSection, headerMilestones, tapeStrips, type FlatRow } from './timelineUtils';
import { forEachItem, sectionsExtent } from './itemTree';
import { addDaysToKey, dayKeyDiff, fromDayKey, toDayKey, todayKey } from './dayKeys';
import { formatDate, getAxisMarks } from './dateUtils';
import { getReadableTextColor, hexToHsl, hslToHex } from './colorUtils';
import { anchorDay, indexItems, isDependencyViolated } from './dependencyUtils';
import {
  SLIDE_AXIS_HEIGHT,
  SLIDE_DEP_CLEARANCE,
  SLIDE_DEP_STUB,
  SLIDE_HEIGHT_PT,
  SLIDE_INK,
  SLIDE_LABEL_WIDTH,
  SLIDE_MARGIN_BOTTOM,
  SLIDE_MARGIN_TOP,
  SLIDE_MARGIN_X,
  SLIDE_MAX_FONT_PT,
  SLIDE_MAX_SCALE,
  SLIDE_MIN_FONT_PT,
  SLIDE_MIN_LABEL_WIDTH,
  SLIDE_NESTED_ROW,
  SLIDE_ROOT_ROW,
  SLIDE_SCHEDULE_ROW,
  SLIDE_SECTION_GAP,
  SLIDE_TAPE_SEAM,
  SLIDE_TITLE_HEIGHT,
  SLIDE_WIDTH_PT,
} from '../constants/slideDimensions';

/**
 * The timeline as a page of shapes.
 *
 * This is the whole layout of the PowerPoint export and it knows nothing about
 * PowerPoint: it walks the same `flattenSection` the screen lays out with and
 * returns a flat list of rectangles, diamonds, lines and text in points from
 * the slide's top-left corner. `pptxExport` turns that list into a file, and
 * anything else that wanted to draw the same page — a preview, a test — reads
 * the same list.
 *
 * Collapse state is honoured rather than expanded: `flattenSection` already
 * returns nothing for a folded schedule and stops at a folded bar, so what the
 * plan contains is what was on screen. One slide is a hard constraint, so rows
 * are scaled to whatever fits and type is clamped to a legible floor.
 */

export interface SlideShapeBase {
  /** Shown in PowerPoint's selection pane, so a shape can be found by name. */
  readonly name: string;
}

export interface SlideRect extends SlideShapeBase {
  readonly kind: 'rect';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill: string;
  /** 0-100, matching the wash nested bars take on screen. */
  readonly transparency?: number;
  /** A hairline edge, for shapes that are drawn covering one another. */
  readonly outline?: { readonly color: string; readonly width: number };
  readonly text?: string;
  readonly textColor?: string;
  readonly fontSize?: number;
}

export interface SlideDiamond extends SlideShapeBase {
  readonly kind: 'diamond';
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
  readonly fill: string;
}

export interface SlideDot extends SlideShapeBase {
  readonly kind: 'dot';
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
  readonly fill: string;
}

export interface SlidePoint {
  readonly x: number;
  readonly y: number;
}

export interface SlidePolyline extends SlideShapeBase {
  readonly kind: 'polyline';
  readonly points: readonly SlidePoint[];
  readonly color: string;
  readonly width: number;
  readonly dashed?: boolean;
  /** Arrowhead on the final segment only. */
  readonly arrow?: boolean;
}

export interface SlideText extends SlideShapeBase {
  readonly kind: 'text';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly text: string;
  readonly color: string;
  readonly fontSize: number;
  readonly bold?: boolean;
  readonly align: 'left' | 'center' | 'right';
}

export type SlideShape = SlideRect | SlideDiamond | SlideDot | SlidePolyline | SlideText;

export interface SlidePlan {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly shapes: readonly SlideShape[];
  /** How far rows were squeezed to make one slide. 1 is natural size. */
  readonly scale: number;
  readonly rowCount: number;
}

export interface SlidePlanOptions {
  /** Dependency ink. On by default: a slide cannot be hovered. */
  readonly includeDependencies?: boolean;
  /** Overridden by tests; production always exports against the real day. */
  readonly today?: string;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Helvetica's advance widths as fractions of the point size — Arial, the face
 * the slide ships with, shares them to the unit. Grouped by width and unrolled
 * into a per-character map once at module load. A flat mean here made "WWW"
 * spill past its bar (the renderer never wraps) and cut "illim" names short.
 */
const CHAR_WIDTH_GROUPS: ReadonlyArray<readonly [number, string]> = [
  [0.191, "'"],
  [0.222, 'ijl'],
  [0.26, '|'],
  [0.278, ' !,./:;[]\\ftI'],
  [0.333, '-()`r'],
  [0.334, '{}'],
  [0.355, '"'],
  [0.389, '*'],
  [0.469, '^'],
  [0.5, 'cksvxyzJ'],
  [0.556, '0123456789#$?_abdeghnopquL–'],
  [0.584, '+<=>~'],
  [0.611, 'FTZ'],
  [0.667, '&ABEKPSVXY'],
  [0.722, 'CDHNRUw'],
  [0.778, 'GOQ'],
  [0.833, 'Mm'],
  [0.889, '%'],
  [0.944, 'W'],
  [1, '@…—'],
];

const CHAR_WIDTHS = new Map<string, number>();
for (const [width, chars] of CHAR_WIDTH_GROUPS) {
  for (const ch of chars) CHAR_WIDTHS.set(ch, width);
}

/** Glyphs off the table: CJK and fullwidth forms print square, the rest land mid-table. */
const FALLBACK_CHAR_WIDTH = 0.6;
const WIDE_CHAR_START = 0x2e80;

export function estimateTextWidth(text: string, fontSizePt: number): number {
  let units = 0;
  for (const ch of text) {
    units +=
      CHAR_WIDTHS.get(ch) ??
      ((ch.codePointAt(0) ?? 0) >= WIDE_CHAR_START ? 1 : FALLBACK_CHAR_WIDTH);
  }
  return units * fontSizePt;
}

/**
 * As much of `text` as fits, with an ellipsis when it had to be cut.
 *
 * PowerPoint will happily spill a long name outside the shape holding it, and
 * `fit: 'shrink'` only takes effect once someone edits the box — so the cut is
 * made here, where the width is known.
 */
export function fitText(text: string, fontSizePt: number, maxWidthPt: number): string {
  if (!text) return '';
  if (maxWidthPt <= 0) return '';
  if (estimateTextWidth(text, fontSizePt) <= maxWidthPt) return text;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (estimateTextWidth(`${text.slice(0, mid)}…`, fontSizePt) <= maxWidthPt) low = mid;
    else high = mid - 1;
  }
  return low > 0 ? `${text.slice(0, low).trimEnd()}…` : '';
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Type sized off the row that holds it, never below reading size. */
const fontForRow = (rowHeight: number, ratio: number): number =>
  clamp(rowHeight * ratio, SLIDE_MIN_FONT_PT, SLIDE_MAX_FONT_PT);

/**
 * Whether a mark can carry its own name.
 *
 * Type has a legible floor, so a squeezed sheet reaches a point where 5pt no
 * longer fits inside a bar that is 2pt tall — and printing it anyway is how a
 * dense slide turns into overlapping ink. Past that point the name belongs to
 * the label column alone, which is what the app does at small zoom too.
 */
const fitsOnRow = (band: number, fontSize: number, ratio = 1): boolean => band >= fontSize * ratio;

/** PowerPoint takes hex without the hash. */
const hex = (color: string): string => color.replace('#', '').toUpperCase();

/**
 * A bar colour dark enough to read as text on white paper.
 *
 * A group's summary line keeps the item's own colour, and its name sits on the
 * paper above it rather than on any fill — so the pale end of the palette has
 * to be walked down before it is used as ink.
 */
export function inkForPaper(color: string): string {
  const { h, s, l } = hexToHsl(color);
  return l <= 45 ? hex(color) : hex(hslToHex(h, s, 42));
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** One schedule, measured before anything is drawn. */
interface SectionPlan {
  readonly section: Section;
  readonly rows: readonly FlatRow[];
  /** Rows only, at natural size — the schedule's own row is counted separately. */
  readonly naturalBody: number;
}

const naturalRowHeight = (depth: number): number =>
  depth === 0 ? SLIDE_ROOT_ROW : SLIDE_NESTED_ROW;

/** Pinned schedule first, then declared order — the stacking the screen uses. */
function orderSections(sections: readonly Section[], pinnedSectionId: string | null): Section[] {
  return [...sections].sort((a, b) => {
    if (a.id === pinnedSectionId) return -1;
    if (b.id === pinnedSectionId) return 1;
    return a.order - b.order;
  });
}

/** Space the tightest axis mark may claim, in points. */
const AXIS_MIN_MARK_SPACING = 26;

/**
 * Build the slide.
 *
 * Sections arrive as they are held in the store — collapsed flags and all —
 * because the collapse state *is* the thing being exported.
 */
export function buildSlidePlan(
  project: Project,
  sections: readonly Section[],
  dependencies: readonly DependencyEdge[] = [],
  options: SlidePlanOptions = {}
): SlidePlan {
  const { includeDependencies = true, today = todayKey() } = options;

  const shapes: SlideShape[] = [];
  const background: SlideShape[] = [];
  const foreground: SlideShape[] = [];

  const plotX = SLIDE_MARGIN_X + SLIDE_LABEL_WIDTH;
  const plotRight = SLIDE_WIDTH_PT - SLIDE_MARGIN_X;
  const plotWidth = plotRight - plotX;
  const contentTop = SLIDE_MARGIN_TOP + SLIDE_TITLE_HEIGHT + SLIDE_AXIS_HEIGHT;
  const contentBottom = SLIDE_HEIGHT_PT - SLIDE_MARGIN_BOTTOM;

  // -- horizontal scale ----------------------------------------------------
  //
  // The window is the union of every schedule's declared range and every item
  // in it — the same extent the screen draws — but without the month of air
  // `computeViewportBounds` adds for dragging into. A slide is not dragged, so
  // that air is width the bars would rather have.
  const extent = sectionsExtent(sections);
  const rawStart = extent?.start ?? project.projectStartDate;
  const rawEnd = extent?.end ?? project.projectEndDate;
  const rawSpan = Math.max(1, dayKeyDiff(rawStart, rawEnd));
  const padDays = Math.max(1, Math.round(rawSpan * 0.02));
  const startKey = addDaysToKey(rawStart, -padDays);
  const endKey = addDaysToKey(rawEnd, padDays);
  const totalDays = Math.max(1, dayKeyDiff(startKey, endKey));

  const xForKey = (key: string): number =>
    plotX + (dayKeyDiff(startKey, key) / totalDays) * plotWidth;

  // -- title ---------------------------------------------------------------
  //
  // The covered range prints beside the name because the slide leaves the app:
  // the axis below only names a year where one changes, and a deck read months
  // later should not need the app open to say which year this was.
  const startLabel = formatDate(fromDayKey(rawStart), 'MMM yyyy');
  const endLabel = formatDate(fromDayKey(rawEnd), 'MMM yyyy');
  const rangeText = startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  const rangeWidth = 200;
  const titleWidth = SLIDE_WIDTH_PT - SLIDE_MARGIN_X * 2 - rangeWidth - 12;

  shapes.push({
    kind: 'text',
    name: 'Project name',
    x: SLIDE_MARGIN_X,
    y: SLIDE_MARGIN_TOP,
    w: titleWidth,
    h: SLIDE_TITLE_HEIGHT,
    text: fitText(project.name, 14, titleWidth),
    color: SLIDE_INK.title,
    fontSize: 14,
    bold: true,
    align: 'left',
  });
  shapes.push({
    kind: 'text',
    name: 'Date range',
    x: SLIDE_WIDTH_PT - SLIDE_MARGIN_X - rangeWidth,
    y: SLIDE_MARGIN_TOP,
    w: rangeWidth,
    h: SLIDE_TITLE_HEIGHT,
    text: rangeText,
    color: SLIDE_INK.muted,
    fontSize: 9,
    align: 'right',
  });

  const ordered = orderSections(sections, project.pinnedSectionId ?? null);

  const plans: SectionPlan[] = ordered.map((section) => {
    const rows = flattenSection(section);
    return {
      section,
      rows,
      naturalBody: rows.reduce((sum, row) => sum + naturalRowHeight(row.depth), 0),
    };
  });

  const rowCount = plans.reduce((sum, plan) => sum + plan.rows.length, 0);

  // -- vertical scale ------------------------------------------------------
  const naturalHeight =
    plans.reduce((sum, plan) => sum + SLIDE_SCHEDULE_ROW + plan.naturalBody, 0) +
    Math.max(0, plans.length - 1) * SLIDE_SECTION_GAP;

  const available = contentBottom - contentTop;
  const scale = naturalHeight > 0 ? Math.min(SLIDE_MAX_SCALE, available / naturalHeight) : 1;

  // A plan shorter than the page floats to the middle of the plot rather than
  // huddling under the axis over a run of dead paper.
  const blockTop = contentTop + Math.max(0, (available - naturalHeight * scale) / 2);

  const scheduleRowHeight = SLIDE_SCHEDULE_ROW * scale;
  const sectionGap = SLIDE_SECTION_GAP * scale;

  // -- axis ----------------------------------------------------------------
  const axisFont = 8;
  const marks = getAxisMarks(startKey, endKey, plotWidth / totalDays, AXIS_MIN_MARK_SPACING);

  let axisYearShown = false;
  for (const mark of marks) {
    const x = xForKey(toDayKey(mark.date));
    if (x < plotX - 0.5 || x > plotRight + 0.5) continue;

    // The first month on the sheet says which year it is, not just January.
    const showYear = mark.wantsYear && (!axisYearShown || mark.date.getMonth() === 0);
    if (mark.wantsYear) axisYearShown = true;
    const label = showYear
      ? `${mark.label} ${String(mark.date.getFullYear()).slice(2)}`
      : mark.label;

    foreground.push({
      kind: 'text',
      name: `Axis ${label}`,
      x: x - 26,
      y: contentTop - SLIDE_AXIS_HEIGHT,
      w: 52,
      h: SLIDE_AXIS_HEIGHT,
      text: label,
      color: SLIDE_INK.muted,
      fontSize: axisFont,
      align: 'center',
    });

    // Gridlines read as gaps in the paper on screen, where the ground is grey.
    // On white paper the same job falls to the lightest line that still shows.
    background.push({
      kind: 'polyline',
      name: `Gridline ${label}`,
      points: [
        { x, y: contentTop },
        { x, y: contentBottom },
      ],
      color: SLIDE_INK.gridline,
      width: 0.75,
    });
  }

  // -- schedules -----------------------------------------------------------
  /** Row centre for every item, for dependency ink to point at. */
  const itemY = new Map<string, number>();
  /** Each schedule's own row, which is where everything folded into it lands. */
  const sectionCenters = new Map<string, number>();

  let y = blockTop;

  plans.forEach((plan, planIndex) => {
    const { section, rows } = plan;
    const isPinned = section.id === project.pinnedSectionId;
    const scheduleTop = y;
    const scheduleCenter = scheduleTop + scheduleRowHeight / 2;
    sectionCenters.set(section.id, scheduleCenter);
    const bodyHeight = plan.naturalBody * scale;
    const sectionBottom = scheduleTop + scheduleRowHeight + bodyHeight;

    if (planIndex > 0) {
      background.push({
        kind: 'polyline',
        name: `Rule above ${section.name}`,
        points: [
          { x: SLIDE_MARGIN_X, y: scheduleTop - sectionGap / 2 },
          { x: plotRight, y: scheduleTop - sectionGap / 2 },
        ],
        color: SLIDE_INK.hairline,
        width: 0.75,
      });
    }

    const scheduleFont = fontForRow(scheduleRowHeight, 0.4);
    foreground.push({
      kind: 'text',
      name: `Schedule ${section.name}`,
      x: SLIDE_MARGIN_X,
      y: scheduleTop,
      w: SLIDE_LABEL_WIDTH - 6,
      h: scheduleRowHeight,
      text: fitText(
        isPinned ? `${section.name} ★` : section.name,
        scheduleFont,
        SLIDE_LABEL_WIDTH - 6
      ),
      color: SLIDE_INK.title,
      fontSize: scheduleFont,
      bold: true,
      align: 'left',
    });

    // A folded schedule keeps its bars: they print as a tape across the upper
    // half of its own row, exactly as `CollapsedBars` draws them, and the lower
    // half stays free for the markers that share the row.
    //
    // `tapeStrips` decides the order, so the slide covers the same bar the
    // screen covers, and hands back the day each strip is covered from — a
    // name is typeset into the run that is still visible rather than across
    // ink another bar has taken over. The paper hairline is what tells two
    // touching strips apart; PowerPoint draws it as the shape's own edge.
    const strips = section.isCollapsed ? tapeStrips(section) : [];
    if (strips.length > 0) {
      const tapeTop = scheduleTop + scheduleRowHeight * 0.14;
      const tapeHeight = scheduleRowHeight * 0.38;
      const tapeFont = fontForRow(tapeHeight * 2, 0.4);

      strips.forEach(({ item, color, coveredFrom }) => {
        const left = xForKey(item.start);
        const width = Math.max(1.5, xForKey(item.end) - left);
        const visible = coveredFrom === null ? width : Math.max(0, xForKey(coveredFrom) - left);
        foreground.push({
          kind: 'rect',
          name: item.name || 'Bar',
          x: left,
          y: tapeTop,
          w: width,
          h: tapeHeight,
          fill: hex(color),
          outline: { color: SLIDE_INK.paper, width: SLIDE_TAPE_SEAM },
          text:
            visible >= SLIDE_MIN_LABEL_WIDTH && fitsOnRow(tapeHeight, tapeFont, 0.95)
              ? fitText(item.name, tapeFont, visible - 6)
              : undefined,
          textColor: hex(getReadableTextColor(color)),
          fontSize: tapeFont,
        });
      });
    }

    // -- markers on the schedule's own row ---------------------------------
    //
    // Root milestones belong to the schedule rather than to any row, and rule a
    // reference line down past its items — the pinned schedule's runs the whole
    // sheet, as on screen.
    // Sorted by day: a name's room runs to the next marker on the sheet, and
    // the items array keeps insertion order, not date order.
    const markerRow = [...headerMilestones(section)].sort((a, b) =>
      a.start < b.start ? -1 : a.start > b.start ? 1 : 0
    );
    const markerCenter = section.isCollapsed
      ? scheduleTop + scheduleRowHeight * 0.74
      : scheduleCenter;
    const markerSize = clamp(scheduleRowHeight * 0.34, 4, 11);
    const markerFont = fontForRow(scheduleRowHeight, 0.36);
    const lineBottom = isPinned ? contentBottom : sectionBottom;

    markerRow.forEach((milestone, index) => {
      const x = xForKey(milestone.start);
      itemY.set(milestone.id, markerCenter);

      background.push({
        kind: 'polyline',
        name: `Reference line ${milestone.name || 'Milestone'}`,
        points: [
          { x, y: markerCenter + markerSize / 2 },
          { x, y: lineBottom },
        ],
        color: SLIDE_INK.milestoneLine,
        width: 0.75,
      });

      // Ink, not the item colour: the screen prints every milestone as an ink
      // tick (`MilestoneGlyph`), and the slide follows it.
      foreground.push({
        kind: 'diamond',
        name: milestone.name || 'Milestone',
        cx: x,
        cy: markerCenter,
        size: markerSize,
        fill: SLIDE_INK.title,
      });

      // The name runs to whatever the next marker leaves free, so a crowded
      // row cuts names short rather than printing them over one another.
      const next = markerRow[index + 1];
      const room = Math.min(next ? xForKey(next.start) - x - markerSize - 3 : plotRight - x, 110);
      const text = fitsOnRow(scheduleRowHeight, markerFont, 1.1)
        ? fitText(milestone.name, markerFont, room)
        : '';
      if (text) {
        foreground.push({
          kind: 'text',
          name: `Label ${milestone.name}`,
          x: x + markerSize / 2 + 2,
          y: markerCenter - markerFont,
          w: Math.max(room, 8),
          h: markerFont * 2,
          text,
          color: SLIDE_INK.label,
          fontSize: markerFont,
          align: 'left',
        });
      }
    });

    y = scheduleTop + scheduleRowHeight;

    // -- rows ---------------------------------------------------------------
    for (const row of rows) {
      const { item, depth, color } = row;
      const rowHeight = naturalRowHeight(depth) * scale;
      const rowTop = y;
      const center = rowTop + rowHeight / 2;
      const isGroup = item.kind === 'bar' && item.children.length > 0 && !item.isCollapsed;
      // An open group's ink is its span line, low in the row — dependency
      // arrows aim at what is printed, not at the row's empty middle.
      const spanY = rowTop + rowHeight * 0.72;
      itemY.set(item.id, isGroup ? spanY : center);

      const labelFont = fontForRow(rowHeight, depth === 0 ? 0.42 : 0.46);
      const indent = SLIDE_MARGIN_X + 10 + 9 * depth;
      const labelWidth = SLIDE_MARGIN_X + SLIDE_LABEL_WIDTH - 6 - indent;

      foreground.push({
        kind: 'text',
        name: `Row ${item.name || 'Untitled'}`,
        x: indent,
        y: rowTop,
        w: Math.max(labelWidth, 10),
        h: rowHeight,
        text: fitText(item.name, labelFont, labelWidth),
        color: depth === 0 ? SLIDE_INK.label : SLIDE_INK.muted,
        fontSize: labelFont,
        align: 'left',
      });

      if (item.kind === 'milestone') {
        const x = xForKey(item.start);
        const size = clamp(rowHeight * 0.42, 4, 10);
        // Ink, as on screen — `MilestoneGlyph` never takes the item colour.
        foreground.push({
          kind: 'diamond',
          name: item.name || 'Milestone',
          cx: x,
          cy: center,
          size,
          fill: SLIDE_INK.title,
        });
        const text = fitsOnRow(rowHeight, labelFont, 1.1)
          ? fitText(item.name, labelFont, plotRight - x - size)
          : '';
        if (text) {
          foreground.push({
            kind: 'text',
            name: `Label ${item.name}`,
            x: x + size / 2 + 2,
            y: center - labelFont,
            w: Math.max(plotRight - x - size, 8),
            h: labelFont * 2,
            text,
            color: SLIDE_INK.muted,
            fontSize: labelFont,
            align: 'left',
          });
        }
        y += rowHeight;
        continue;
      }

      const left = xForKey(item.start);
      const width = Math.max(1.5, xForKey(item.end) - left);

      if (isGroup) {
        // A bar whose children are on the slide is a rollup, not a block of
        // work: it prints as a span with a terminal at each end and its name
        // on the paper above, so the children below read as what fills it.
        // A *folded* group keeps its fill — its children are not on the sheet,
        // so the block is the only thing standing for them.
        const strokeHeight = Math.max(1.5, rowHeight * 0.1);
        const dot = clamp(rowHeight * 0.3, 3.5, 9);
        const ink = inkForPaper(color);

        foreground.push({
          kind: 'rect',
          name: `${item.name || 'Group'} span`,
          x: left,
          y: spanY - strokeHeight / 2,
          w: width,
          h: strokeHeight,
          fill: hex(color),
        });
        foreground.push({
          kind: 'dot',
          name: `${item.name || 'Group'} start`,
          cx: left,
          cy: spanY,
          size: dot,
          fill: hex(color),
        });
        foreground.push({
          kind: 'dot',
          name: `${item.name || 'Group'} end`,
          cx: left + width,
          cy: spanY,
          size: dot,
          fill: hex(color),
        });

        const groupFont = fontForRow(rowHeight, 0.44);
        // A short span still gets room for a name — but never past the paper's
        // right edge, where it would print over whatever stands there.
        const nameWidth = Math.min(Math.max(width, 60), plotRight - left);
        // The name sits above the span, so the row has to hold two bands
        const text = fitsOnRow(rowHeight, groupFont, 1.9)
          ? fitText(item.name, groupFont, nameWidth)
          : '';
        if (text) {
          foreground.push({
            kind: 'text',
            name: `${item.name || 'Group'} name`,
            x: left,
            y: rowTop + rowHeight * 0.06,
            w: nameWidth,
            h: rowHeight * 0.56,
            text,
            color: ink,
            fontSize: groupFont,
            align: 'left',
          });
        }
      } else {
        const barHeight = rowHeight * (depth === 0 ? 0.5 : 0.46);
        const barFont = fontForRow(rowHeight, 0.42);
        foreground.push({
          kind: 'rect',
          name: item.name || 'Bar',
          x: left,
          y: center - barHeight / 2,
          w: width,
          h: barHeight,
          fill: hex(color),
          // A nested bar inherits its parent's colour, so on paper the wash
          // is what keeps a child from reading as more of the same bar.
          transparency: depth === 0 ? undefined : 22,
          text:
            width >= SLIDE_MIN_LABEL_WIDTH && fitsOnRow(barHeight, barFont, 0.95)
              ? fitText(item.name, barFont, width - 6)
              : undefined,
          textColor: hex(getReadableTextColor(color)),
          fontSize: barFont,
        });

        // A folded group carries a rule under it, as it does on screen: the
        // one mark saying there is work here that the sheet is not showing.
        if (item.children.length > 0) {
          foreground.push({
            kind: 'rect',
            name: `${item.name || 'Bar'} holds more`,
            x: left,
            y: center + barHeight / 2 + Math.max(1, rowHeight * 0.05),
            w: width,
            h: Math.max(1, rowHeight * 0.06),
            fill: hex(color),
          });
        }
      }

      y += rowHeight;
    }

    y = sectionBottom + sectionGap;
  });

  // Anything folded away borrows the row of the nearest ancestor that is on
  // the sheet, and a folded schedule stands in for everything inside it — the
  // same substitution `computeItemPoints` makes on screen. Parents are visited
  // before their children, so by the time a child asks, its parent has already
  // resolved to whichever row is showing for it.
  for (const plan of plans) {
    const fallback = sectionCenters.get(plan.section.id) ?? contentTop;
    forEachItem(plan.section.items, (item, parent) => {
      if (itemY.has(item.id)) return;
      itemY.set(item.id, parent ? (itemY.get(parent.id) ?? fallback) : fallback);
    });
  }

  // -- today ---------------------------------------------------------------
  //
  // Ruled over the bars, as on screen — behind them it disappears into a
  // dense sheet. Its foot names the day, because a slide is static: "today"
  // drifts the moment the file is saved, a date does not.
  const overlay: SlideShape[] = [];
  if (today >= startKey && today <= endKey) {
    const x = xForKey(today);
    overlay.push({
      kind: 'polyline',
      name: 'Today',
      points: [
        { x, y: contentTop },
        { x, y: contentBottom },
      ],
      color: SLIDE_INK.today,
      width: 1,
    });
    overlay.push({
      kind: 'text',
      name: 'Today date',
      x: x - 26,
      y: contentBottom + 1,
      w: 52,
      h: 9,
      text: formatDate(fromDayKey(today), 'MMM d'),
      color: SLIDE_INK.today,
      fontSize: 7,
      align: 'center',
    });
  }

  // -- dependencies --------------------------------------------------------
  const links: SlideShape[] = [];
  if (includeDependencies && dependencies.length > 0) {
    const byId = indexItems(sections);

    for (const edge of dependencies) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) continue;

      const y1 = itemY.get(edge.from);
      const y2 = itemY.get(edge.to);
      if (y1 === undefined || y2 === undefined) continue;

      const fromX = xForKey(anchorDay(from, edge.fromAnchor));
      const toX = xForKey(anchorDay(to, edge.toAnchor));
      const points = routeDependency(
        { x: fromX, y: y1, away: awaySide(from, edge.fromAnchor, fromX, toX) },
        { x: toX, y: y2, away: awaySide(to, edge.toAnchor, toX, fromX) }
      );

      const violated = isDependencyViolated(edge, from, to);
      links.push({
        kind: 'polyline',
        name: `Link ${from.name || 'item'} → ${to.name || 'item'}`,
        points,
        color: violated ? SLIDE_INK.dependencyViolated : SLIDE_INK.dependency,
        width: violated ? 1.25 : 0.9,
        arrow: true,
      });
    }
  }

  shapes.push(...background, ...foreground, ...overlay, ...links);

  return {
    widthPt: SLIDE_WIDTH_PT,
    heightPt: SLIDE_HEIGHT_PT,
    shapes,
    scale,
    rowCount,
  };
}

/**
 * Which side of an item a connector stands off: a bar's anchor edge faces
 * outward, and a point has no sides, so it faces the other end. The same rule
 * `resolveEndpoints` applies on screen. Exported for the PNG exporter, which
 * routes its connectors with the same elbow.
 */
export function awaySide(
  item: TimelineItem,
  anchor: DependencyAnchor,
  ownX: number,
  otherX: number
): 1 | -1 {
  if (item.kind === 'milestone') return otherX >= ownX ? 1 : -1;
  return anchor === 'end' ? 1 : -1;
}

export interface SlideEndpoint {
  readonly x: number;
  readonly y: number;
  /** Which side the connector leaves or enters from: +1 right, -1 left. */
  readonly away: 1 | -1;
}

/**
 * A connector's corners, edge to edge — the square elbow `routeConnector`
 * draws on screen, minus the terminal-dot offsets a slide has no dots to hold.
 * Out of the end it leaves from, over, and in **from the anchor's own side**:
 * an end is entered from the right, a start from the left, so a line never
 * crosses the bar it is pointing at. Three segments when the approach already
 * lands from that side; five when it has to double back — or when both ends
 * share a row and the straight line would run the wrong way, where the link
 * dips below the row rather than striking back through the bars it annotates.
 *
 * `stub` and `clearance` default to the slide's points; the PNG passes its
 * own, scaled to its pixels.
 */
export function routeDependency(
  from: SlideEndpoint,
  to: SlideEndpoint,
  stub: number = SLIDE_DEP_STUB,
  clearance: number = SLIDE_DEP_CLEARANCE
): SlidePoint[] {
  const p1x = from.x + from.away * stub;
  const p4x = to.x + to.away * stub;

  if (Math.abs(from.y - to.y) < 0.5) {
    const travel = Math.sign(to.x - from.x) || 1;
    const agreeable = from.away === travel && to.away === -travel;
    if (agreeable && Math.abs(to.x - from.x) >= 2 * stub) {
      return [
        { x: from.x, y: from.y },
        { x: to.x, y: to.y },
      ];
    }
    const clearY = from.y + clearance;
    return [
      { x: from.x, y: from.y },
      { x: p1x, y: from.y },
      { x: p1x, y: clearY },
      { x: p4x, y: clearY },
      { x: p4x, y: to.y },
      { x: to.x, y: to.y },
    ];
  }

  const finalDir = Math.sign(to.x - p1x) || 1;
  if (finalDir === -to.away && Math.abs(to.x - p1x) >= stub) {
    return [
      { x: from.x, y: from.y },
      { x: p1x, y: from.y },
      { x: p1x, y: to.y },
      { x: to.x, y: to.y },
    ];
  }

  const midY = (from.y + to.y) / 2;
  return [
    { x: from.x, y: from.y },
    { x: p1x, y: from.y },
    { x: p1x, y: midY },
    { x: p4x, y: midY },
    { x: p4x, y: to.y },
    { x: to.x, y: to.y },
  ];
}
