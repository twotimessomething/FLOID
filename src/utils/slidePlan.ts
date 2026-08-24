import type { Project } from '../types/project';
import type { DependencyAnchor, DependencyEdge, Section } from '../types/timeline';
import { getItemColor } from '../types/itemColor';
import { flattenSection, headerMilestones, type FlatRow } from './timelineUtils';
import { forEachItem, sectionsExtent } from './itemTree';
import { addDaysToKey, dayKeyDiff, fromDayKey, toDayKey, todayKey } from './dayKeys';
import { getMonthMarkers } from './dateUtils';
import { getReadableTextColor, hexToHsl, hslToHex } from './colorUtils';
import { anchorDay, indexItems, isDependencyViolated } from './dependencyUtils';
import {
  SLIDE_AXIS_HEIGHT,
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

/** Mean glyph width of a sans face, as a fraction of its point size. */
const CHAR_WIDTH_RATIO = 0.52;

export function estimateTextWidth(text: string, fontSizePt: number): number {
  return text.length * fontSizePt * CHAR_WIDTH_RATIO;
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

/**
 * Which months carry a mark.
 *
 * A two-year sheet has no room for twelve labels a year, so the cadence comes
 * from the space each mark would get rather than from the zoom the user last
 * picked — months, quarters, half-years, then years.
 */
function axisStep(monthCount: number, plotWidth: number): number {
  const perMonth = monthCount > 0 ? plotWidth / monthCount : plotWidth;
  const MIN_MARK_SPACING = 26;
  for (const step of [1, 3, 6, 12]) {
    if (perMonth * step >= MIN_MARK_SPACING) return step;
  }
  return 12;
}

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

  // -- title ---------------------------------------------------------------
  shapes.push({
    kind: 'text',
    name: 'Project name',
    x: SLIDE_MARGIN_X,
    y: SLIDE_MARGIN_TOP,
    w: SLIDE_WIDTH_PT - SLIDE_MARGIN_X * 2,
    h: SLIDE_TITLE_HEIGHT,
    text: project.name,
    color: SLIDE_INK.title,
    fontSize: 14,
    bold: true,
    align: 'left',
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

  // -- vertical scale ------------------------------------------------------
  const naturalHeight =
    plans.reduce((sum, plan) => sum + SLIDE_SCHEDULE_ROW + plan.naturalBody, 0) +
    Math.max(0, plans.length - 1) * SLIDE_SECTION_GAP;

  const available = contentBottom - contentTop;
  const scale = naturalHeight > 0 ? Math.min(SLIDE_MAX_SCALE, available / naturalHeight) : 1;

  const scheduleRowHeight = SLIDE_SCHEDULE_ROW * scale;
  const sectionGap = SLIDE_SECTION_GAP * scale;

  // -- axis ----------------------------------------------------------------
  const markers = getMonthMarkers(fromDayKey(startKey), fromDayKey(endKey));
  const step = axisStep(markers.length, plotWidth);
  const axisFont = 8;

  for (const marker of markers) {
    const month = marker.date.getMonth();
    if (step > 1 && month % step !== 0) continue;

    const x = xForKey(toDayKey(marker.date));
    if (x < plotX - 0.5 || x > plotRight + 0.5) continue;

    const label =
      step >= 12
        ? String(marker.date.getFullYear())
        : month === 0
          ? `${marker.label} ${String(marker.date.getFullYear()).slice(2)}`
          : marker.label;

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

  let y = contentTop;

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
    const rootBars = section.items.filter((item) => item.kind === 'bar');
    if (section.isCollapsed && rootBars.length > 0) {
      const tapeTop = scheduleTop + scheduleRowHeight * 0.14;
      const tapeHeight = scheduleRowHeight * 0.38;
      const tapeFont = fontForRow(tapeHeight * 2, 0.4);

      rootBars.forEach((item, index) => {
        const color = getItemColor(item, section, index, rootBars.length);
        const left = xForKey(item.start);
        const width = Math.max(1.5, xForKey(item.end) - left);
        foreground.push({
          kind: 'rect',
          name: item.name || 'Bar',
          x: left,
          y: tapeTop,
          w: width,
          h: tapeHeight,
          fill: hex(color),
          text:
            width >= SLIDE_MIN_LABEL_WIDTH && fitsOnRow(tapeHeight, tapeFont, 0.95)
              ? fitText(item.name, tapeFont, width - 6)
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
    const markerRow = headerMilestones(section);
    const markerCenter = section.isCollapsed
      ? scheduleTop + scheduleRowHeight * 0.74
      : scheduleCenter;
    const markerSize = clamp(scheduleRowHeight * 0.34, 4, 11);
    const markerFont = fontForRow(scheduleRowHeight, 0.36);
    const lineBottom = isPinned ? contentBottom : sectionBottom;

    markerRow.forEach((milestone, index) => {
      const x = xForKey(milestone.start);
      const color = milestone.color ?? section.color;
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

      foreground.push({
        kind: 'diamond',
        name: milestone.name || 'Milestone',
        cx: x,
        cy: markerCenter,
        size: markerSize,
        fill: hex(color),
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
      itemY.set(item.id, center);

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
        foreground.push({
          kind: 'diamond',
          name: item.name || 'Milestone',
          cx: x,
          cy: center,
          size,
          fill: hex(color),
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
      const isGroup = item.children.length > 0 && !item.isCollapsed;

      if (isGroup) {
        // A bar whose children are on the slide is a rollup, not a block of
        // work: it prints as a span with a terminal at each end and its name
        // on the paper above, so the children below read as what fills it.
        // A *folded* group keeps its fill — its children are not on the sheet,
        // so the block is the only thing standing for them.
        const spanY = rowTop + rowHeight * 0.72;
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
        // The name sits above the span, so the row has to hold two bands
        const text = fitsOnRow(rowHeight, groupFont, 1.9)
          ? fitText(item.name, groupFont, Math.max(width, 60))
          : '';
        if (text) {
          foreground.push({
            kind: 'text',
            name: `${item.name || 'Group'} name`,
            x: left,
            y: rowTop + rowHeight * 0.06,
            w: Math.max(width, 60),
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
          // Nested bars sit over the parent they belong to; the wash is what
          // stands in for the multiply blend the screen gets and PowerPoint
          // has no equivalent of.
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
  if (today >= startKey && today <= endKey) {
    const x = xForKey(today);
    background.push({
      kind: 'polyline',
      name: 'Today',
      points: [
        { x, y: contentTop },
        { x, y: contentBottom },
      ],
      color: SLIDE_INK.today,
      width: 1,
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

      const points = routeDependency(
        xForKey(anchorDay(from, edge.fromAnchor)),
        y1,
        edge.fromAnchor,
        xForKey(anchorDay(to, edge.toAnchor)),
        y2
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

  shapes.push(...background, ...foreground, ...links);

  return {
    widthPt: SLIDE_WIDTH_PT,
    heightPt: SLIDE_HEIGHT_PT,
    shapes,
    scale,
    rowCount,
  };
}

/**
 * A connector's corners, dot to dot.
 *
 * Square corners like everything else on this paper: out of the end it leaves
 * from, down or up to the row it is going to, then straight in. One corner
 * column rather than two — a second one only ever produced a backtrack, and
 * back-to-back work, where the two ends stand on the same day, is the case
 * that suffers most from it.
 *
 * A link that runs backwards gets the same three segments; its final run
 * crosses the sheet right to left, which is exactly the shape of the problem
 * it is reporting.
 */
export function routeDependency(
  x1: number,
  y1: number,
  fromAnchor: DependencyAnchor,
  x2: number,
  y2: number
): SlidePoint[] {
  if (Math.abs(y1 - y2) < 0.5) {
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }

  const cornerX = x1 + (fromAnchor === 'end' ? SLIDE_DEP_STUB : -SLIDE_DEP_STUB);

  return [
    { x: x1, y: y1 },
    { x: cornerX, y: y1 },
    { x: cornerX, y: y2 },
    { x: x2, y: y2 },
  ];
}
