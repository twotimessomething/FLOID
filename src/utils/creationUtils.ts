import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { addDaysToKey, dayKeyDiff, maxDayKey, minDayKey, type DayKey } from './dayKeys';
import { formatDayKey } from './dateUtils';
import { findItem } from './itemTree';
import { xToDay } from './timelineUtils';
import type { ModalPosition, ViewportBounds } from '../types/timeline';

/**
 * Every interactive way to make something on the timeline funnels through here,
 * so a bar drawn by dragging, dropped by a context menu, or added from a
 * keyboard shortcut is the same bar with the same defaults — and, in every
 * case, is selected afterwards so the naming editor opens on it.
 */

/** A bar drawn with a single double-click, in days. */
export const DEFAULT_BAR_DAYS = 30;
/** The same gesture inside a parent bar, where 30 days would usually overflow. */
export const DEFAULT_NESTED_BAR_DAYS = 7;

export interface CreateSpan {
  readonly start: string;
  readonly end: string;
}

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
  /** The day it ends. */
  readonly end: string;
  /** How long it is, in words: '1 day', '14 days'. */
  readonly duration: string;
}

/** The same short date the move preview and the resize bubble use. */
const READOUT_DATE_FORMAT = 'MMM d';
/** Only where the short one would be ambiguous. */
const READOUT_DATED_FORMAT = 'MMM d, yyyy';

export function describeDrawnSpan(a: DayKey, b: DayKey): DrawnSpanReadout {
  const { start, end } = resolveDrawnSpan(a, b);
  const days = dayKeyDiff(start, end);
  // A span that crosses New Year has two ends that read alike and are a year
  // apart, so both take the year. Inside one year the year is noise.
  const dateFormat =
    start.slice(0, 4) === end.slice(0, 4) ? READOUT_DATE_FORMAT : READOUT_DATED_FORMAT;
  return {
    start: formatDayKey(start, dateFormat),
    end: formatDayKey(end, dateFormat),
    duration: days === 1 ? '1 day' : `${days} days`,
  };
}

/**
 * Pixels → the readout for the bar those pixels would make, for one row at one
 * scale. It walks the whole commit path — day mapping, the weekend snap, the
 * one-day floor — so the numbers under the cursor cannot drift from the bar
 * that appears when the pointer comes up.
 */
export function drawnSpanDescriber(
  viewport: ViewportBounds,
  pixelsPerDay: number,
  snap: (key: DayKey) => DayKey
): (startPx: number, endPx: number) => DrawnSpanReadout {
  return (startPx, endPx) =>
    describeDrawnSpan(
      snap(xToDay(startPx, viewport, pixelsPerDay)),
      snap(xToDay(endPx, viewport, pixelsPerDay))
    );
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
  const newId = store.addItem(
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
    options.index
  );

  useUIStore.getState().selectItem(newId, sectionId, selectAt);
  return newId;
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
  const store = useSectionStore.getState();
  if (!store.sections.some((s) => s.id === sectionId)) return null;

  const newId = store.addItem(
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
    options.index
  );

  useUIStore.getState().selectItem(newId, sectionId, selectAt);
  return newId;
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
