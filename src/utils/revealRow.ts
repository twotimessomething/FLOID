import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { commitWithSlide } from '../commands/slideCommit';
import { prefersReducedMotion } from './easing';
import { dayKeyDiff, type DayKey } from './dayKeys';
import { findItem, findItemPath } from './itemTree';
import { measureMilestoneLabelWidth } from './labelLayoutUtils';
import {
  EDGE_FADE_HEIGHT,
  MIN_BAR_WIDTH,
  ROW_HEIGHT,
  SECTION_HAIRLINE,
  STICKY_SLOT_HEIGHT,
  flattenSection,
  sectionBoxHeight,
  stickySlotTop,
} from './timelineUtils';
import type { ModalPosition, Section, TimelineItem } from '../types';

/**
 * Bringing a row into view — for the arrow keys, the status sidebar, and
 * anything else that selects something the user may not be looking at.
 *
 * The row's place is worked out from the same `flattenSection` walk the
 * sheet renders from, not read off the DOM: a fold opened to reach it is
 * still sliding when the scroll is aimed, and a measured rect would aim at
 * where the row was. What the sheet's own chrome covers is part of the sum —
 * the date axis, and the schedules held under it as their rows scroll past.
 */

const SCROLLPORT_SELECTOR = '.timeline-scroll-container';
const PLOT_SELECTOR = '[data-flip-column="plot"]';

/** Air kept beside ink brought in from off the sheet — enough to clear a marker's name. */
const REVEAL_GUTTER = 32;

/** What to bring into view: a schedule's own row, or an item on it. */
export interface RevealTarget {
  readonly sectionId: string;
  /** Null for the schedule's own row. */
  readonly itemId: string | null;
}

/** A stretch of the sheet, in px from the plot's left edge. */
export interface Span {
  readonly left: number;
  readonly right: number;
}

/** Where a row prints, in px from the plot's top-left corner. */
export interface RowBox {
  /** The schedule's place on the sheet, the pinned one first. */
  readonly sectionIndex: number;
  /** Top of the schedule's box: the hairline it prints under. */
  readonly sectionTop: number;
  readonly top: number;
  readonly height: number;
  /** The schedule's own row — its name, and the markers that print on it. */
  readonly isScheduleRow: boolean;
  /** The ink across the sheet. Null for a schedule, which spans it. */
  readonly ink: Span | null;
  /** The ink and room for its name: what a reveal brings into view. */
  readonly room: Span | null;
}

/**
 * An item's ink, and the room it takes with its name. A bar carries its name
 * inside it; a point prints its name beside it or centred under it, so it is
 * given room for either.
 */
function extentOf(
  item: TimelineItem,
  origin: DayKey,
  pixelsPerDay: number
): Pick<RowBox, 'ink' | 'room'> {
  const left = dayKeyDiff(origin, item.start) * pixelsPerDay;
  if (item.kind !== 'bar') {
    const nameWidth = item.name ? measureMilestoneLabelWidth(item.name) : 0;
    return {
      ink: { left, right: left },
      room: { left: left - nameWidth / 2, right: left + nameWidth },
    };
  }
  const right = dayKeyDiff(origin, item.end) * pixelsPerDay;
  const ink = { left, right: Math.max(left + MIN_BAR_WIDTH, right) };
  return { ink, room: ink };
}

/**
 * Where the target prints on the sheet as the sections stand. A root marker
 * prints on its schedule's own row, and so does anything folded out of sight.
 */
export function locateRow(
  sections: readonly Section[],
  target: RevealTarget,
  origin: DayKey,
  pixelsPerDay: number
): RowBox | null {
  let sectionTop = 0;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    if (section.id !== target.sectionId) {
      sectionTop += sectionBoxHeight(section);
      continue;
    }

    const headerTop = sectionTop + SECTION_HAIRLINE;
    const scheduleRow = { sectionIndex, sectionTop, top: headerTop, height: ROW_HEIGHT };
    if (target.itemId === null) {
      return { ...scheduleRow, isScheduleRow: true, ink: null, room: null };
    }

    const itemId = target.itemId;
    const row = section.isCollapsed
      ? undefined
      : flattenSection(section).find((candidate) => candidate.item.id === itemId);
    if (row) {
      return {
        sectionIndex,
        sectionTop,
        top: headerTop + ROW_HEIGHT + row.top,
        height: row.height,
        isScheduleRow: false,
        ...extentOf(row.item, origin, pixelsPerDay),
      };
    }

    const item = findItem(section.items, itemId);
    return item
      ? { ...scheduleRow, isScheduleRow: true, ...extentOf(item, origin, pixelsPerDay) }
      : null;
  }
  return null;
}

/**
 * The scrollTop that brings a row into view, moving the sheet as little as it
 * can — or the one it has, when the row is already in view.
 *
 * A schedule is held under the axis once its own row scrolls beneath the
 * schedules held before it (`Timeline`'s `sectionThresholds`), and its band
 * *is* that row, so a schedule's row is never out of view at the top. An
 * item's row is: it is clear while its schedule is not yet held, or once it
 * is, while the row stands below that schedule's band and the wash under it.
 * The schedules held above that one are always higher than either.
 */
export function revealScrollTop(
  box: RowBox,
  scrollTop: number,
  viewHeight: number,
  plotTop: number
): number {
  const rowTop = plotTop + box.top;
  const earliest = rowTop + box.height - viewHeight;
  if (box.isScheduleRow) return scrollTop < earliest ? earliest : scrollTop;

  const lastUnheld = box.sectionTop - box.sectionIndex * STICKY_SLOT_HEIGHT;
  const lastClear = rowTop - stickySlotTop(box.sectionIndex + 1) - EDGE_FADE_HEIGHT;
  const latest = Math.max(lastUnheld, lastClear);

  if (scrollTop > latest) return Math.max(0, latest);
  if (scrollTop < earliest) return Math.max(0, Math.min(earliest, latest));
  return scrollTop;
}

/**
 * The scrollLeft that brings a span into view with a gutter beside it. Ink
 * longer than the window brings in its start, which is where its name is —
 * unless the window is already showing its start, or nothing but it.
 */
export function revealScrollLeft(span: Span, scrollLeft: number, viewWidth: number): number {
  const from = span.left - REVEAL_GUTTER;
  const to = span.right + REVEAL_GUTTER;
  const viewRight = scrollLeft + viewWidth;

  if (to - from <= viewWidth) {
    if (from < scrollLeft) return Math.max(0, from);
    if (to > viewRight) return to - viewWidth;
    return scrollLeft;
  }

  const showsStart = span.left >= scrollLeft && span.left <= viewRight - REVEAL_GUTTER;
  const fillsView = span.left < scrollLeft && span.right > viewRight;
  return showsStart || fillsView ? scrollLeft : Math.max(0, from);
}

/** The sections in the order they print: the pinned one on top. */
function sheetOrder(): readonly Section[] {
  const { sections } = useSectionStore.getState();
  const pinnedId = useProjectStore.getState().project?.pinnedSectionId;
  const pinned = pinnedId ? sections.find((section) => section.id === pinnedId) : undefined;
  return pinned ? [pinned, ...sections.filter((section) => section !== pinned)] : sections;
}

/**
 * Open every fold between a schedule and one of its items. One step of
 * history however many folds it takes: undo puts them all back together.
 */
function unfoldTo(sectionId: string, itemId: string): void {
  const store = useSectionStore.getState();
  const section = store.sections.find((candidate) => candidate.id === sectionId);
  const path = section ? findItemPath(section.items, itemId) : null;
  if (!section || !path) return;

  // A root marker prints on the schedule's own row, folded or not
  const isOnScheduleRow = path.length === 1 && path[0].kind === 'milestone';
  const foldedSection = section.isCollapsed && !isOnScheduleRow;
  const foldedGroups = path.slice(0, -1).filter((ancestor) => ancestor.isCollapsed);
  if (!foldedSection && foldedGroups.length === 0) return;

  commitWithSlide(() => {
    store.beginDragTransaction();
    if (foldedSection) store.toggleSectionCollapse(sectionId);
    foldedGroups.forEach((group) => store.toggleItemCollapse(sectionId, group.id));
    store.commitDragTransaction();
  });
}

/**
 * Unfold whatever hides the target, then scroll the sheet — on both axes, and
 * smoothly unless less motion was asked for — until the target stands clear
 * of the axis and the schedules held under it.
 *
 * Returns where the target's ink will stand on screen once the sheet arrives:
 * the corner an editor for it opens from, as a click on it would open one.
 * Undefined when there is no sheet to reveal it on.
 */
export function revealRow(target: RevealTarget): ModalPosition | undefined {
  if (target.itemId !== null) unfoldTo(target.sectionId, target.itemId);

  const scroller = document.querySelector<HTMLElement>(SCROLLPORT_SELECTOR);
  const plot = scroller?.querySelector<HTMLElement>(PLOT_SELECTOR);
  const origin = plot?.dataset.flipOrigin;
  const pixelsPerDay = Number(plot?.dataset.flipPpd);
  if (!scroller || !plot || !origin || !(pixelsPerDay > 0)) return undefined;

  const box = locateRow(sheetOrder(), target, origin, pixelsPerDay);
  if (!box) return undefined;

  const port = scroller.getBoundingClientRect();
  const sheet = plot.getBoundingClientRect();
  const plotTop = sheet.top - port.top + scroller.scrollTop;
  const plotLeft = sheet.left - port.left + scroller.scrollLeft;
  const room = box.room
    ? { left: plotLeft + box.room.left, right: plotLeft + box.room.right }
    : null;

  // Clamped here rather than by the browser, so the anchor below is aimed at
  // where the sheet really stops
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const top = Math.min(
    maxTop,
    revealScrollTop(box, scroller.scrollTop, scroller.clientHeight, plotTop)
  );
  const left = room
    ? Math.min(maxLeft, revealScrollLeft(room, scroller.scrollLeft, scroller.clientWidth))
    : scroller.scrollLeft;

  // Even when nothing has to move: a press that reverses the last one finds
  // its row in view mid-scroll, and the sheet must stop there rather than
  // carry on to where the last press was taking it
  scroller.scrollTo({ top, left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

  // A schedule scrolled under the axis is printed on its band instead
  const rowY = port.top + plotTop + box.top - top;
  const y = box.isScheduleRow
    ? Math.max(rowY, port.top + stickySlotTop(box.sectionIndex) + SECTION_HAIRLINE)
    : rowY;
  // Beside the ink itself, as a click on it would put it: a point's name is
  // room to reveal, not something for the editor to stand off from
  const viewLeft = port.left;
  const viewRight = port.left + scroller.clientWidth;
  const inkRight = box.ink ? viewLeft + plotLeft + box.ink.right - left : viewLeft;
  const x = Math.min(viewRight, Math.max(viewLeft, inkRight));
  return { x, y };
}
