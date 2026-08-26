import type { Section, TimelineItem, ViewportBounds, ZoomLevel } from '../types/timeline';
import { getItemColor } from '../types/itemColor';
import { findItemPath } from './itemTree';
import { addDaysToKey, dayKeyDiff } from './dayKeys';

/**
 * Timeline geometry.
 *
 * One mapping, in one direction and back: a day key is `pixelsPerDay` from the
 * viewport's first day. Nothing nests, nothing rescales — which is why an item
 * can be dropped into a different parent, or a different schedule, and land on
 * exactly the same pixel it left.
 */

export const ZOOM_PIXELS_PER_DAY: Record<ZoomLevel, number> = {
  day: 40,
  week: 20,
  month: 6,
  quarter: 2,
};

/** Schedule header rows and root item rows. */
export const ROW_HEIGHT = 48;
/** Every item below the root, bar or milestone. */
export const NESTED_ROW_HEIGHT = 30;
export const HEADER_HEIGHT = 48;
/** Reserved beneath a schedule's items so there is always somewhere to draw. */
export const CREATE_ROW_HEIGHT = ROW_HEIGHT;
/** Smallest bar the eye can still grab. */
export const MIN_BAR_WIDTH = 6;

export const getPixelsPerDay = (zoomLevel: ZoomLevel): number => ZOOM_PIXELS_PER_DAY[zoomLevel];

/** A fitted view is free of the named levels, but not of legibility. */
export const MIN_FIT_PIXELS_PER_DAY = 0.2;
export const MAX_FIT_PIXELS_PER_DAY = 80;

/** The scale that lays `totalDays` across `width` exactly, within those bounds. */
export const getFitPixelsPerDay = (totalDays: number, width: number): number | null => {
  if (totalDays <= 0 || width <= 0) return null;
  const exact = width / totalDays;
  return Math.min(MAX_FIT_PIXELS_PER_DAY, Math.max(MIN_FIT_PIXELS_PER_DAY, exact));
};

/**
 * Which axis a scale should be labelled on. A fitted view lands between the
 * named levels, so markers come from the density of the scale rather than
 * from the level the user last picked.
 */
export const zoomLevelForPixelsPerDay = (pixelsPerDay: number): ZoomLevel => {
  if (pixelsPerDay >= 25) return 'day';
  if (pixelsPerDay >= 12) return 'week';
  if (pixelsPerDay >= 3.5) return 'month';
  return 'quarter';
};

export const rowHeightForDepth = (depth: number): number =>
  depth === 0 ? ROW_HEIGHT : NESTED_ROW_HEIGHT;

/** Vertical inset of a bar inside its row, so rows breathe. */
export const barInsetForDepth = (depth: number): number => (depth === 0 ? 8 : 6);

/**
 * A collapsed schedule folds its bars into its own row, where they print as a
 * tape across the upper half. The lower half is not spare space — it belongs to
 * the markers that share that row, and to their names.
 */
export const COLLAPSED_TAPE_TOP = 6;
export const COLLAPSED_TAPE_HEIGHT = 18;

/** One root bar of a folded schedule, in the order the tape is laid down. */
export interface TapeStrip {
  readonly item: TimelineItem;
  /** Resolved from the bar's place in the schedule, not from the paint order. */
  readonly color: string;
  /**
   * The day the next strip lands on top of this one, or `null` if nothing
   * covers it. A strip's name is typeset into the run before this day, so a
   * name never ends up printed on ink that belongs to another bar.
   */
  readonly coveredFrom: string | null;
}

/**
 * A folded schedule's root bars, ordered for the tape.
 *
 * The tape is strips of paper, not overprinted ink: the strip that starts
 * later is laid over the one before it, so a run of work reads left to right
 * and three bars crossing the same week stay three colours instead of turning
 * to mud. Bars that start on the same day break the tie by length, longest
 * first, which is what keeps a bar drawn inside another one on top of it
 * rather than buried under it.
 */
export const tapeStrips = (section: Section): readonly TapeStrip[] => {
  const bars = section.items.filter((item) => item.kind === 'bar');
  const laid = bars
    .map((item, index) => ({ item, color: getItemColor(item, section, index, bars.length) }))
    .sort((a, b) =>
      a.item.start === b.item.start
        ? b.item.end < a.item.end
          ? -1
          : b.item.end > a.item.end
            ? 1
            : 0
        : a.item.start < b.item.start
          ? -1
          : 1
    );

  return laid.map((strip, index) => {
    const next = laid[index + 1]?.item.start ?? null;
    return {
      ...strip,
      coveredFrom: next !== null && next < strip.item.end ? next : null,
    };
  });
};

/**
 * Label column indentation. The schedule name is the root of the tree, so it
 * sits furthest out and every item steps in from it — the same ladder the PNG
 * exporter draws.
 */
export const LABEL_ROOT_INSET = 12;
export const LABEL_INDENT_STEP = 16;
export const labelInsetForDepth = (depth: number): number =>
  LABEL_ROOT_INSET + LABEL_INDENT_STEP * (depth + 1);

// ---------------------------------------------------------------------------
// Day ↔ pixel
// ---------------------------------------------------------------------------

export const dayToX = (key: string, viewport: ViewportBounds, pixelsPerDay: number): number =>
  dayKeyDiff(viewport.startKey, key) * pixelsPerDay;

export const xToDay = (x: number, viewport: ViewportBounds, pixelsPerDay: number): string =>
  addDaysToKey(viewport.startKey, pixelsPerDay > 0 ? Math.round(x / pixelsPerDay) : 0);

/**
 * Viewport-relative 0-1 positions. Items never use these — only the playhead,
 * which is a position on the sheet rather than a date.
 */
export const getPositionFromRelative = (relative: number, timelineWidth: number): number =>
  relative * timelineWidth;

export const getRelativeFromPosition = (position: number, timelineWidth: number): number =>
  timelineWidth > 0 ? Math.max(0, Math.min(1, position / timelineWidth)) : 0;

export interface BarRect {
  readonly left: number;
  readonly width: number;
}

export const getBarRect = (
  item: TimelineItem,
  viewport: ViewportBounds,
  pixelsPerDay: number
): BarRect => {
  const left = dayToX(item.start, viewport, pixelsPerDay);
  if (item.kind === 'milestone') return { left, width: 0 };
  const right = dayToX(item.end, viewport, pixelsPerDay);
  return { left, width: Math.max(MIN_BAR_WIDTH, right - left) };
};

// ---------------------------------------------------------------------------
// Row layout
// ---------------------------------------------------------------------------

/**
 * One rendered row. Both columns — labels and bars — walk the same list, which
 * is the only reason they stay aligned at arbitrary depth.
 */
export interface FlatRow {
  readonly item: TimelineItem;
  readonly parentId: string | null;
  /** Index within its own sibling list — the drop slot a row represents. */
  readonly index: number;
  readonly siblingCount: number;
  /** Last sibling that actually draws a row, so only it hosts a trailing slot. */
  readonly isLastRenderedSibling: boolean;
  readonly depth: number;
  /** Resolved colour, inherited down the tree. */
  readonly color: string;
  readonly top: number;
  readonly height: number;
  readonly isLocked: boolean;
}

/**
 * Flatten a schedule into rows.
 *
 * Root milestones are left out on purpose: they live in the schedule's header
 * row, drawn against the whole schedule. Every other item — including a
 * milestone dragged inside a bar — gets a row of its own.
 */
export function flattenSection(section: Section): FlatRow[] {
  const rows: FlatRow[] = [];
  if (section.isCollapsed) return rows;

  const rootCount = section.items.filter((item) => item.kind === 'bar').length;
  let top = 0;
  let rootIndex = -1;

  const walk = (
    items: readonly TimelineItem[],
    parentId: string | null,
    depth: number,
    inherited: string | undefined,
    parentLocked: boolean
  ): void => {
    // Root milestones print on the schedule's own row, so the last item in the
    // array is not necessarily the last one with a row of its own
    const lastRenderedIndex = items.reduce(
      (last, item, index) => (depth === 0 && item.kind === 'milestone' ? last : index),
      -1
    );

    items.forEach((item, index) => {
      if (depth === 0) {
        if (item.kind === 'milestone') return; // drawn in the header row
        rootIndex += 1;
      }

      const color = getItemColor(item, section, Math.max(0, rootIndex), rootCount, inherited);
      const height = rowHeightForDepth(depth);
      const isLocked = parentLocked || item.isLocked === true;

      rows.push({
        item,
        parentId,
        index,
        siblingCount: items.length,
        isLastRenderedSibling: index === lastRenderedIndex,
        depth,
        color,
        top,
        height,
        isLocked,
      });
      top += height;

      if (item.kind === 'bar' && !item.isCollapsed && item.children.length > 0) {
        walk(item.children, item.id, depth + 1, color, isLocked);
      }
    });
  };

  walk(section.items, null, 0, undefined, section.isLocked === true);
  return rows;
}

/**
 * The colour one item paints with, walked down its own ancestry.
 *
 * `flattenSection` resolves this for everything on screen, but a collapsed
 * subtree has no row — so anything asking about a single item off the timeline
 * (the editor's swatch, for one) has to walk the chain itself.
 */
export function resolveItemColor(section: Section, itemId: string): string {
  const path = findItemPath(section.items, itemId);
  if (!path || path.length === 0) return section.color;

  const rootBars = section.items.filter((item) => item.kind === 'bar');
  const rootIndex = Math.max(
    0,
    rootBars.findIndex((item) => item.id === path[0].id)
  );

  let color: string | undefined;
  for (const item of path) {
    color = getItemColor(item, section, rootIndex, rootBars.length, color);
  }
  return color ?? section.color;
}

/** Root-level milestones, which render on the schedule's header row. */
export function headerMilestones(section: Section): TimelineItem[] {
  return section.items.filter((item) => item.kind === 'milestone');
}

/** Height of a schedule's body, excluding its header row. */
export function sectionBodyHeight(section: Section): number {
  if (section.isCollapsed) return 0;
  const rows = flattenSection(section);
  const used = rows.reduce((sum, row) => sum + row.height, 0);
  return used + CREATE_ROW_HEIGHT;
}

/** Full height of a schedule, header row included. */
export function calculateSectionHeight(section: Section): number {
  return ROW_HEIGHT + sectionBodyHeight(section);
}

/**
 * The hairline every schedule prints under. `SectionRow` carries it as a
 * `border-t`, so a schedule's box on the sheet is this much taller than the
 * rows inside it — anything walking the stack to find a row has to count it.
 */
export const SECTION_HAIRLINE = 1;

/**
 * A schedule's whole box: the hairline it prints under and every row beneath
 * it. Stacking schedules means stacking these — `calculateSectionHeight`
 * measures only what is inside one, so a walk built from it drifts a pixel per
 * schedule and the sticky bands land a pixel high.
 */
export function sectionBoxHeight(section: Section): number {
  return SECTION_HAIRLINE + calculateSectionHeight(section);
}

/**
 * A band under the axis stands in for a schedule's own row, so it is the same
 * height as that row's box: the hairline, then the row.
 */
export const STICKY_SLOT_HEIGHT = SECTION_HAIRLINE + ROW_HEIGHT;

/** Where the band for a held schedule sits, measured from the top of the timeline area. */
export function stickySlotTop(slot: number): number {
  return HEADER_HEIGHT + slot * STICKY_SLOT_HEIGHT;
}

/** How much paper the axis dissolves the rows scrolling under it into. */
export const EDGE_FADE_HEIGHT = 16;
