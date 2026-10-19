import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewportBounds } from '../types/timeline';
import { describeDrawnSpan, drawnSpanDescriber, resolveDrawnSpan } from '../utils/creationUtils';
import { fromDayKey, snapSpanToBusinessDays, type DaySpan } from '../utils/dayKeys';

const viewport: ViewportBounds = {
  startDate: fromDayKey('2026-08-03'),
  endDate: fromDayKey('2026-09-30'),
  startKey: '2026-08-03',
  endKey: '2026-09-30',
  totalDays: 58,
};

/** 2026-08-03 is a Monday. */
const identity = (span: DaySpan): DaySpan => span;

// The readout drops the year inside the current one, so the clock is held there
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 1));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveDrawnSpan', () => {
  it('orders the two drawn edges', () => {
    expect(resolveDrawnSpan('2026-08-20', '2026-08-10')).toEqual({
      start: '2026-08-10',
      end: '2026-08-20',
    });
  });

  it('holds the one-day floor when both edges land on the same day', () => {
    expect(resolveDrawnSpan('2026-08-10', '2026-08-10')).toEqual({
      start: '2026-08-10',
      end: '2026-08-11',
    });
  });
});

describe('describeDrawnSpan', () => {
  it('reports the first day, the last day and the length', () => {
    // The end is exclusive: a span to the Aug 17 edge last covers Aug 16
    expect(describeDrawnSpan('2026-08-03', '2026-08-17')).toEqual({
      start: 'Aug 3',
      end: 'Aug 16',
      duration: '14 days',
    });
  });

  it('carries the year only where the span crosses one', () => {
    expect(describeDrawnSpan('2026-12-20', '2027-01-10')).toEqual({
      start: 'Dec 20, 2026',
      end: 'Jan 9, 2027',
      duration: '21 days',
    });
    // Its edge is New Year's Day, but its last day is still this year's
    expect(describeDrawnSpan('2026-12-20', '2027-01-01')).toEqual({
      start: 'Dec 20',
      end: 'Dec 31',
      duration: '12 days',
    });
  });

  it('carries the year on a span in another year', () => {
    expect(describeDrawnSpan('2027-03-01', '2027-03-15')).toEqual({
      start: 'Mar 1, 2027',
      end: 'Mar 14, 2027',
      duration: '14 days',
    });
  });

  it('says a single day in the singular, starting and ending on it', () => {
    expect(describeDrawnSpan('2026-08-03', '2026-08-03')).toEqual({
      start: 'Aug 3',
      end: 'Aug 3',
      duration: '1 day',
    });
  });
});

describe('drawnSpanDescriber', () => {
  it('reads the days the pixels sit on', () => {
    const describe = drawnSpanDescriber(viewport, 20, identity);
    // 20px per day from Aug 3: 40px is the Aug 5 edge, 200px the Aug 13 one
    expect(describe(40, 200)).toEqual({ start: 'Aug 5', end: 'Aug 12', duration: '8 days' });
  });

  it('reports the weekend snap the drop will apply', () => {
    const describe = drawnSpanDescriber(viewport, 20, snapSpanToBusinessDays);
    // 100px is Saturday Aug 8, which commits as Monday Aug 10
    expect(describe(100, 240).start).toBe('Aug 10');
    // 240px is the Saturday Aug 15 edge: the last day is Friday, and stays
    expect(describe(40, 240).end).toBe('Aug 14');
    // 260px is the Sunday edge, a last day of Saturday: it pulls back to Friday
    expect(describe(40, 260)).toEqual({ start: 'Aug 5', end: 'Aug 14', duration: '10 days' });
  });

  it('lets a span drawn inside a weekend stand rather than vanish', () => {
    const describe = drawnSpanDescriber(viewport, 20, snapSpanToBusinessDays);
    expect(describe(100, 140)).toEqual({ start: 'Aug 8', end: 'Aug 9', duration: '2 days' });
  });

  it('reports the same span whichever way it was drawn', () => {
    const describe = drawnSpanDescriber(viewport, 20, identity);
    expect(describe(200, 40)).toEqual(describe(40, 200));
  });
});
