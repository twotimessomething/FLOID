import { describe, expect, it } from 'vitest';
import type { ViewportBounds } from '../types/timeline';
import { describeDrawnSpan, drawnSpanDescriber, resolveDrawnSpan } from '../utils/creationUtils';
import { fromDayKey, snapKeyToBusinessDay } from '../utils/dayKeys';

const viewport: ViewportBounds = {
  startDate: fromDayKey('2026-08-03'),
  endDate: fromDayKey('2026-09-30'),
  startKey: '2026-08-03',
  endKey: '2026-09-30',
  totalDays: 58,
};

/** 2026-08-03 is a Monday. */
const identity = (key: string): string => key;

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
  it('reports both dates and the length', () => {
    expect(describeDrawnSpan('2026-08-03', '2026-08-17')).toEqual({
      start: 'Aug 3',
      end: 'Aug 17',
      duration: '14 days',
    });
  });

  it('carries the year only where the span crosses one', () => {
    expect(describeDrawnSpan('2026-12-20', '2027-01-10')).toEqual({
      start: 'Dec 20, 2026',
      end: 'Jan 10, 2027',
      duration: '21 days',
    });
  });

  it('says a single day in the singular', () => {
    expect(describeDrawnSpan('2026-08-03', '2026-08-03').duration).toBe('1 day');
  });
});

describe('drawnSpanDescriber', () => {
  it('reads the days the pixels sit on', () => {
    const describe = drawnSpanDescriber(viewport, 20, identity);
    // 20px per day from Aug 3: 40px is Aug 5, 200px is Aug 13
    expect(describe(40, 200)).toEqual({ start: 'Aug 5', end: 'Aug 13', duration: '8 days' });
  });

  it('reports the weekend snap the drop will apply', () => {
    const describe = drawnSpanDescriber(viewport, 20, snapKeyToBusinessDay);
    // 100px is Saturday Aug 8, which commits as Monday Aug 10
    expect(describe(100, 240).start).toBe('Aug 10');
  });

  it('reports the same span whichever way it was drawn', () => {
    const describe = drawnSpanDescriber(viewport, 20, identity);
    expect(describe(200, 40)).toEqual(describe(40, 200));
  });
});
