import { describe, it, expect } from 'vitest';
import type { Section, TimelineItem } from '../types';
import { locateRow, revealScrollLeft, revealScrollTop, type RowBox } from '../utils/revealRow';
import { measureMilestoneLabelWidth } from '../utils/labelLayoutUtils';
import {
  CREATE_ROW_HEIGHT,
  EDGE_FADE_HEIGHT,
  HEADER_HEIGHT,
  NESTED_ROW_HEIGHT,
  ROW_HEIGHT,
  SECTION_HAIRLINE,
  STICKY_SLOT_HEIGHT,
  stickySlotTop,
} from '../utils/timelineUtils';

function bar(id: string, start: string, end: string, children: TimelineItem[] = []): TimelineItem {
  return {
    id,
    kind: 'bar',
    name: id,
    description: '',
    start,
    end,
    color: null,
    isCollapsed: false,
    children,
  };
}

function milestone(id: string, day: string): TimelineItem {
  return { ...bar(id, day, day), kind: 'milestone' };
}

function section(id: string, items: TimelineItem[], overrides: Partial<Section> = {}): Section {
  return {
    id,
    name: id,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items,
    color: '#333333',
    isCollapsed: false,
    ...overrides,
  };
}

const ORIGIN = '2026-01-01';
const PPD = 10;

describe('locateRow', () => {
  const sections = [
    section('s1', [bar('a', '2026-01-11', '2026-01-21'), milestone('m', '2026-02-01')]),
    section('s2', [bar('g', '2026-03-01', '2026-04-01', [bar('g1', '2026-03-05', '2026-03-06')])]),
  ];
  // s1: hairline, its own row, one bar row, the create row
  const s2Top = SECTION_HAIRLINE + ROW_HEIGHT + ROW_HEIGHT + CREATE_ROW_HEIGHT;

  it('puts a schedule on its own row, spanning the sheet', () => {
    expect(locateRow(sections, { sectionId: 's2', itemId: null }, ORIGIN, PPD)).toEqual({
      sectionIndex: 1,
      sectionTop: s2Top,
      top: s2Top + SECTION_HAIRLINE,
      height: ROW_HEIGHT,
      isScheduleRow: true,
      ink: null,
      room: null,
    });
  });

  it('puts an item on the row flattenSection draws it on, at its dates', () => {
    expect(locateRow(sections, { sectionId: 's1', itemId: 'a' }, ORIGIN, PPD)).toEqual({
      sectionIndex: 0,
      sectionTop: 0,
      top: SECTION_HAIRLINE + ROW_HEIGHT,
      height: ROW_HEIGHT,
      isScheduleRow: false,
      ink: { left: 100, right: 200 },
      room: { left: 100, right: 200 },
    });
  });

  it('gives a nested item its own shorter row', () => {
    const box = locateRow(sections, { sectionId: 's2', itemId: 'g1' }, ORIGIN, PPD);
    expect(box?.top).toBe(s2Top + SECTION_HAIRLINE + ROW_HEIGHT + ROW_HEIGHT);
    expect(box?.height).toBe(NESTED_ROW_HEIGHT);
  });

  it('puts a root marker on its schedule’s own row, at its day, with room for its name', () => {
    const box = locateRow(sections, { sectionId: 's1', itemId: 'm' }, ORIGIN, PPD);
    const nameWidth = measureMilestoneLabelWidth('m');
    expect(box?.isScheduleRow).toBe(true);
    expect(box?.top).toBe(SECTION_HAIRLINE);
    expect(box?.ink).toEqual({ left: 310, right: 310 });
    // Centred under the marker or set beside it: either way it is revealed
    expect(box?.room).toEqual({ left: 310 - nameWidth / 2, right: 310 + nameWidth });
  });

  it('knows nothing of an item that is not there', () => {
    expect(locateRow(sections, { sectionId: 's1', itemId: 'g1' }, ORIGIN, PPD)).toBeNull();
    expect(locateRow(sections, { sectionId: 'nope', itemId: null }, ORIGIN, PPD)).toBeNull();
  });
});

describe('revealScrollTop', () => {
  const VIEW = 600;
  const PLOT_TOP = HEADER_HEIGHT;

  /** An item row in the third schedule, which starts 2000px down the sheet. */
  const itemRow: RowBox = {
    sectionIndex: 2,
    sectionTop: 2000,
    top: 2000 + SECTION_HAIRLINE + ROW_HEIGHT + 5 * ROW_HEIGHT,
    height: ROW_HEIGHT,
    isScheduleRow: false,
    ink: null,
    room: null,
  };
  const rowTop = PLOT_TOP + itemRow.top;

  it('leaves a row that is already in view where it is', () => {
    const scrollTop = rowTop - 300;
    expect(revealScrollTop(itemRow, scrollTop, VIEW, PLOT_TOP)).toBe(scrollTop);
  });

  it('brings a row up from below to the bottom edge', () => {
    expect(revealScrollTop(itemRow, 0, VIEW, PLOT_TOP)).toBe(rowTop + ROW_HEIGHT - VIEW);
  });

  it('brings a row down from above to just under its schedule’s band and the wash', () => {
    const scrollTop = revealScrollTop(itemRow, 5000, VIEW, PLOT_TOP);
    expect(rowTop - scrollTop).toBe(stickySlotTop(3) + EDGE_FADE_HEIGHT);
  });

  it('counts a row clear while its schedule is not yet held', () => {
    // The first row under the schedule's own: at the last unheld scroll it
    // already stands below the held bands, closer than the wash would allow
    const firstRow: RowBox = { ...itemRow, top: 2000 + SECTION_HAIRLINE + ROW_HEIGHT };
    const lastUnheld = firstRow.sectionTop - firstRow.sectionIndex * STICKY_SLOT_HEIGHT;
    expect(revealScrollTop(firstRow, 5000, VIEW, PLOT_TOP)).toBe(lastUnheld);
    expect(revealScrollTop(firstRow, lastUnheld, VIEW, PLOT_TOP)).toBe(lastUnheld);
  });

  it('never scrolls above the top of the sheet', () => {
    const topRow: RowBox = {
      ...itemRow,
      sectionIndex: 0,
      sectionTop: 0,
      top: SECTION_HAIRLINE + ROW_HEIGHT,
    };
    expect(revealScrollTop(topRow, 400, VIEW, PLOT_TOP)).toBe(0);
  });

  it('counts a schedule held under the axis as in view — its band is its row', () => {
    const scheduleRow: RowBox = { ...itemRow, top: 2000 + SECTION_HAIRLINE, isScheduleRow: true };
    expect(revealScrollTop(scheduleRow, 5000, VIEW, PLOT_TOP)).toBe(5000);
    expect(revealScrollTop(scheduleRow, 0, VIEW, PLOT_TOP)).toBe(
      PLOT_TOP + scheduleRow.top + ROW_HEIGHT - VIEW
    );
  });
});

describe('revealScrollLeft', () => {
  const VIEW = 800;

  it('leaves ink that is in view where it is', () => {
    expect(revealScrollLeft({ left: 1100, right: 1300 }, 1000, VIEW)).toBe(1000);
  });

  it('brings ink in from the left with a gutter', () => {
    expect(revealScrollLeft({ left: 500, right: 600 }, 1000, VIEW)).toBe(468);
  });

  it('brings ink in from the right with a gutter', () => {
    expect(revealScrollLeft({ left: 2000, right: 2100 }, 1000, VIEW)).toBe(2132 - VIEW);
  });

  it('brings in the start of a bar longer than the window', () => {
    expect(revealScrollLeft({ left: 3000, right: 6000 }, 0, VIEW)).toBe(2968);
    expect(revealScrollLeft({ left: 3000, right: 6000 }, 6500, VIEW)).toBe(2968);
    // Only its tail showing: the name is off to the left, so the start comes in
    expect(revealScrollLeft({ left: 3000, right: 6000 }, 5500, VIEW)).toBe(2968);
  });

  it('leaves a long bar alone when its start is showing or it fills the window', () => {
    expect(revealScrollLeft({ left: 3100, right: 6000 }, 3000, VIEW)).toBe(3000);
    expect(revealScrollLeft({ left: 3000, right: 6000 }, 4000, VIEW)).toBe(4000);
  });

  it('never scrolls past the start of the sheet', () => {
    expect(revealScrollLeft({ left: 10, right: 20 }, 400, VIEW)).toBe(0);
  });
});
