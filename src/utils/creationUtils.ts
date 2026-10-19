import { flushSync } from 'react-dom';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import {
  addDaysToKey,
  dayKeyDiff,
  lastDayOf,
  maxDayKey,
  minDayKey,
  type DayKey,
  type DaySpan,
} from './dayKeys';
import { formatDayKey, formatShortDay } from './dateUtils';
import { finishDragMotion, settleDuration } from './dragCluster';
import {
  dismissCreatePreview,
  finishCreateMotion,
  playCreateHandoff,
  takeCreateSource,
} from './createHandoff';
import { findItem } from './itemTree';
import { animateLayout } from './layoutFlip';
import { xToDay } from './timelineUtils';
import type { ModalPosition, TimelineItem, ViewportBounds } from '../types/timeline';

/**
 * Every interactive way to make something on the timeline funnels through here,
 * so a bar drawn by dragging, dropped by a context menu, or added from a
 * keyboard shortcut is the same bar with the same defaults — and, in every
 * case, is selected afterwards so the naming editor opens on it.
 *
 * It is also where making something becomes motion rather than a cut. The
 * insert is committed with the rows sliding open around it (`layoutFlip`), and
 * when it came from a gesture the preview that gesture was showing flies into
 * the new item (`createHandoff`) — so a bar drawn in one row and made into the
 * row below is seen to go there.
 */

/** A bar drawn with a single double-click, in days. */
export const DEFAULT_BAR_DAYS = 30;
/** The same gesture inside a parent bar, where 30 days would usually overflow. */
export const DEFAULT_NESTED_BAR_DAYS = 7;

/** A drawn span is a day span like any other. */
export type CreateSpan = DaySpan;

/**
 * The span two drawn edges commit to: ordered, and never shorter than a day.
 * A drag reports through here as well as creating through it, so the dates the
 * gesture shows are the dates it makes.
 */
export function resolveDrawnSpan(a: DayKey, b: DayKey): CreateSpan {
  const start = minDayKey(a, b);
  const drawnEnd = maxDayKey(a, b);
  return { start, end: dayKeyDiff(start, drawnEnd) < 1 ? addDaysToKey(start, 1) : drawnEnd };
}

/** What a span being drawn says about itself while the pointer is still down. */
export interface DrawnSpanReadout {
  /** The day the span begins, formatted. */
  readonly start: string;
  /** The last day it covers — the day before its exclusive end. */
  readonly end: string;
  /** How long it is, in words: '1 day', '14 days'. */
  readonly duration: string;
}

/** Only where the short date would be ambiguous. */
const READOUT_DATED_FORMAT = 'MMM d, yyyy';

export function describeDrawnSpan(a: DayKey, b: DayKey): DrawnSpanReadout {
  const { start, end } = resolveDrawnSpan(a, b);
  const days = dayKeyDiff(start, end);
  const lastDay = lastDayOf(end);
  // A span that crosses New Year has two ends that read alike and are a year
  // apart, so both take the year. Inside one year they read as the move
  // preview and the resize bubble do.
  const show =
    start.slice(0, 4) === lastDay.slice(0, 4)
      ? formatShortDay
      : (key: DayKey): string => formatDayKey(key, READOUT_DATED_FORMAT);
  return {
    start: show(start),
    end: show(lastDay),
    duration: days === 1 ? '1 day' : `${days} days`,
  };
}

/**
 * Pixels → the span a draw commits, for one row at one scale: day mapping, the
 * one-day floor, then the weekend snap. The readout and the commit both come
 * through here, so the numbers under the cursor cannot drift from the bar that
 * appears when the pointer comes up.
 */
export function drawnSpanAt(
  startPx: number,
  endPx: number,
  viewport: ViewportBounds,
  pixelsPerDay: number,
  snap: (span: CreateSpan) => CreateSpan
): CreateSpan {
  return snap(
    resolveDrawnSpan(xToDay(startPx, viewport, pixelsPerDay), xToDay(endPx, viewport, pixelsPerDay))
  );
}

/** Pixels → the readout for the bar `drawnSpanAt` would make. */
export function drawnSpanDescriber(
  viewport: ViewportBounds,
  pixelsPerDay: number,
  snap: (span: CreateSpan) => CreateSpan
): (startPx: number, endPx: number) => DrawnSpanReadout {
  return (startPx, endPx) => {
    const { start, end } = drawnSpanAt(startPx, endPx, viewport, pixelsPerDay, snap);
    return describeDrawnSpan(start, end);
  };
}

interface CreateBarOptions {
  /** An exact range, from drag-to-draw. */
  readonly span?: CreateSpan;
  /** A start day for a default-width bar, from double-click. */
  readonly startDay?: string;
  /** null creates at the schedule root. */
  readonly parentId?: string | null;
  /** Slot among the parent's children; omitted appends. */
  readonly index?: number;
}

type NewItem = Omit<TimelineItem, 'id' | 'children'>;

/**
 * Insert an item, select it, and play its arrival.
 *
 * The insert and the selection land in one synchronous render: the rows are
 * measured right after it, and the copy that flies in is taken from the new
 * element as it will be revealed — already selected, its outline already on —
 * so the hand-over at the end of the flight changes nothing on screen.
 */
function commitNewItem(
  sectionId: string,
  parentId: string | null,
  item: NewItem,
  index: number | undefined,
  selectAt: ModalPosition
): string | null {
  // Taken first and unconditionally: whatever made this item, the preview is
  // spent once it has been asked for.
  const source = takeCreateSource();
  // A new creation wins over anything still landing from the last one.
  finishCreateMotion();
  finishDragMotion();

  const duration = settleDuration(0);
  let newId = '';
  animateLayout(() => {
    flushSync(() => {
      // A locked schedule refuses the insert, and then nothing is selected
      newId = useSectionStore.getState().addItem(sectionId, parentId, item, index) ?? '';
      if (newId) useUIStore.getState().selectItem(newId, sectionId, selectAt);
    });
  }, duration);
  if (!newId) {
    // Nothing to fly into: the preview that offered it fades where it stood
    if (source) dismissCreatePreview(source);
    return null;
  }
  playCreateHandoff(newId, source, duration);
  return newId;
}

/** Create a bar, select it, and return its id. */
export function createBarAt(
  sectionId: string,
  options: CreateBarOptions,
  selectAt: ModalPosition
): string | null {
  const store = useSectionStore.getState();
  const section = store.sections.find((s) => s.id === sectionId);
  if (!section) return null;

  const parentId = options.parentId ?? null;
  const defaultDays = parentId === null ? DEFAULT_BAR_DAYS : DEFAULT_NESTED_BAR_DAYS;

  let start: string;
  let end: string;

  if (options.span) {
    const drawn = resolveDrawnSpan(options.span.start, options.span.end);
    start = drawn.start;
    end = drawn.end;
  } else {
    start = options.startDay ?? nextFreeDay(sectionId, parentId);
    end = addDaysToKey(start, defaultDays);
  }

  // Colour is left unset: a root bar resolves the schedule's palette or gradient
  // from its position, and a nested bar takes its parent's. Baking a colour in
  // here would survive the next drag and break the group it lands in.
  return commitNewItem(
    sectionId,
    parentId,
    {
      kind: 'bar',
      name: '',
      description: '',
      start,
      end,
      color: null,
      isCollapsed: false,
    },
    options.index,
    selectAt
  );
}

interface CreateMilestoneOptions {
  readonly day: string;
  readonly parentId?: string | null;
  readonly index?: number;
}

/** Create a milestone, select it, and return its id. */
export function createMilestoneAt(
  sectionId: string,
  options: CreateMilestoneOptions,
  selectAt: ModalPosition
): string | null {
  if (!useSectionStore.getState().sections.some((s) => s.id === sectionId)) return null;

  return commitNewItem(
    sectionId,
    options.parentId ?? null,
    {
      kind: 'milestone',
      name: '',
      description: '',
      start: options.day,
      end: options.day,
      color: null,
      isCollapsed: false,
    },
    options.index,
    selectAt
  );
}

interface CreateTaskOptions {
  readonly day: string;
  readonly parentId?: string | null;
  readonly index?: number;
}

/**
 * Create a task, select it, and return its id. A task is a milestone that can
 * be checked off: one day, its own row, and a circle instead of a diamond.
 */
export function createTaskAt(
  sectionId: string,
  options: CreateTaskOptions,
  selectAt: ModalPosition
): string | null {
  if (!useSectionStore.getState().sections.some((s) => s.id === sectionId)) return null;

  return commitNewItem(
    sectionId,
    options.parentId ?? null,
    {
      kind: 'task',
      name: '',
      description: '',
      start: options.day,
      end: options.day,
      color: null,
      isCollapsed: false,
      isDone: false,
    },
    options.index,
    selectAt
  );
}

/** Where a bar goes when nothing said where: after whatever is already there. */
function nextFreeDay(sectionId: string, parentId: string | null): string {
  const section = useSectionStore.getState().sections.find((s) => s.id === sectionId);
  if (!section) return new Date().toISOString().slice(0, 10);

  const siblings =
    parentId === null ? section.items : (findItem(section.items, parentId)?.children ?? []);

  const bars = siblings.filter((item) => item.kind === 'bar');
  if (bars.length === 0) {
    return parentId === null
      ? section.startDate
      : (findItem(section.items, parentId)?.start ?? section.startDate);
  }
  return bars.reduce((latest, item) => maxDayKey(latest, item.end), bars[0].end);
}
