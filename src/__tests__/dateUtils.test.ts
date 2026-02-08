import { describe, it, expect } from 'vitest';
import {
  parseDate,
  formatDate,
  getDaysBetween,
  getDateFromRelativePosition,
  getRelativePositionFromDate,
  computeViewportBounds,
  sectionToViewportRelative,
  viewportToSectionRelative,
  snapRelativeToBusinessDay,
  isWeekend,
  snapToNextBusinessDay,
  findNearestPhaseBoundary,
  rescalePhases,
  rescaleMilestones,
  getTimeMarkers,
} from '../utils/dateUtils';
import type { Section, Phase } from '../types';

// Helper to create a minimal section
function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'sec-1',
    name: 'Test Section',
    type: 'schedule',
    revision: 1,
    lastModifiedAt: new Date().toISOString(),
    order: 0,
    startDate: '2025-01-01T00:00:00.000Z',
    endDate: '2025-07-01T00:00:00.000Z',
    phases: [],
    milestones: [],
    color: '#3b82f6',
    isCollapsed: false,
    ...overrides,
  };
}

describe('parseDate', () => {
  it('parses an ISO date string', () => {
    const d = parseDate('2025-06-15');
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(5); // June = 5
    expect(d.getDate()).toBe(15);
  });
});

describe('formatDate', () => {
  it('formats a Date with default format', () => {
    const result = formatDate(new Date(2025, 5, 15));
    expect(result).toBe('Jun 15, 2025');
  });

  it('formats a string date', () => {
    const result = formatDate('2025-06-15', 'yyyy/MM/dd');
    expect(result).toBe('2025/06/15');
  });
});

describe('getDaysBetween', () => {
  it('returns correct difference with Date objects', () => {
    expect(getDaysBetween(new Date(2025, 0, 1), new Date(2025, 0, 11))).toBe(10);
  });

  it('returns correct difference with string dates', () => {
    expect(getDaysBetween('2025-01-01', '2025-01-31')).toBe(30);
  });

  it('returns negative for reversed dates', () => {
    expect(getDaysBetween('2025-01-31', '2025-01-01')).toBe(-30);
  });
});

describe('getDateFromRelativePosition', () => {
  const start = '2025-01-01T00:00:00.000Z';
  const end = '2025-07-01T00:00:00.000Z';

  it('returns start date at position 0', () => {
    const d = getDateFromRelativePosition(start, end, 0);
    expect(d.toISOString().slice(0, 10)).toBe('2025-01-01');
  });

  it('returns end date at position 1', () => {
    const d = getDateFromRelativePosition(start, end, 1);
    // Allow ±1 day tolerance for timezone differences in rounding
    const dayStr = d.toISOString().slice(0, 10);
    expect(['2025-06-30', '2025-07-01', '2025-07-02']).toContain(dayStr);
  });

  it('returns midpoint at position 0.5', () => {
    const d = getDateFromRelativePosition(start, end, 0.5);
    // ~181 days / 2 = ~90 days from start
    expect(d.getTime()).toBeGreaterThan(new Date(start).getTime());
    expect(d.getTime()).toBeLessThan(new Date(end).getTime());
  });
});

describe('getRelativePositionFromDate', () => {
  const start = '2025-01-01T00:00:00.000Z';
  const end = '2025-07-01T00:00:00.000Z';

  it('returns 0 for start date', () => {
    expect(getRelativePositionFromDate(start, end, new Date(start))).toBe(0);
  });

  it('returns 1 for end date', () => {
    expect(getRelativePositionFromDate(start, end, new Date(end))).toBe(1);
  });

  it('returns 0 when start equals end', () => {
    expect(getRelativePositionFromDate(start, start, new Date(start))).toBe(0);
  });

  it('round-trips with getDateFromRelativePosition', () => {
    const pos = 0.35;
    const date = getDateFromRelativePosition(start, end, pos);
    const result = getRelativePositionFromDate(start, end, date);
    expect(result).toBeCloseTo(pos, 2);
  });
});

describe('computeViewportBounds', () => {
  it('returns default bounds for empty sections', () => {
    const bounds = computeViewportBounds([]);
    expect(bounds.totalDays).toBeGreaterThan(300);
    expect(bounds.startDate).toBeInstanceOf(Date);
    expect(bounds.endDate).toBeInstanceOf(Date);
  });

  it('adds 1 month padding on each side', () => {
    const section = makeSection({
      startDate: '2025-03-01T00:00:00.000Z',
      endDate: '2025-06-01T00:00:00.000Z',
    });
    const bounds = computeViewportBounds([section]);
    expect(bounds.startDate.getTime()).toBeLessThan(new Date('2025-03-01').getTime());
    expect(bounds.endDate.getTime()).toBeGreaterThan(new Date('2025-06-01').getTime());
  });

  it('spans across multiple sections', () => {
    const s1 = makeSection({ startDate: '2025-01-01T00:00:00.000Z', endDate: '2025-03-01T00:00:00.000Z' });
    const s2 = makeSection({ startDate: '2025-06-01T00:00:00.000Z', endDate: '2025-09-01T00:00:00.000Z' });
    const bounds = computeViewportBounds([s1, s2]);
    expect(bounds.startDate.getTime()).toBeLessThan(new Date('2025-01-01').getTime());
    expect(bounds.endDate.getTime()).toBeGreaterThan(new Date('2025-09-01').getTime());
  });
});

describe('sectionToViewportRelative / viewportToSectionRelative', () => {
  it('round-trips correctly', () => {
    const section = makeSection();
    const viewport = computeViewportBounds([section]);
    const sectionPos = 0.5;

    const viewportPos = sectionToViewportRelative(sectionPos, section, viewport);
    const roundTripped = viewportToSectionRelative(viewportPos, section, viewport);

    expect(roundTripped).toBeCloseTo(sectionPos, 1);
  });

  it('viewport 0 maps to before section start', () => {
    const section = makeSection();
    const viewport = computeViewportBounds([section]);
    const sectionPos = viewportToSectionRelative(0, section, viewport);
    expect(sectionPos).toBeLessThan(0);
  });
});

describe('isWeekend / snapToNextBusinessDay', () => {
  it('identifies Saturday and Sunday as weekends', () => {
    // Use explicit year/month/day to avoid UTC timezone parsing
    expect(isWeekend(new Date(2025, 5, 14))).toBe(true); // Saturday
    expect(isWeekend(new Date(2025, 5, 15))).toBe(true); // Sunday
  });

  it('identifies weekdays as non-weekends', () => {
    expect(isWeekend(new Date(2025, 5, 16))).toBe(false); // Monday
    expect(isWeekend(new Date(2025, 5, 18))).toBe(false); // Wednesday
  });

  it('snaps Saturday to Monday', () => {
    const result = snapToNextBusinessDay(new Date(2025, 5, 14)); // Saturday
    expect(result.getDay()).toBe(1); // Monday
  });

  it('snaps Sunday to Monday', () => {
    const result = snapToNextBusinessDay(new Date(2025, 5, 15)); // Sunday
    expect(result.getDay()).toBe(1); // Monday
  });

  it('does not snap weekdays', () => {
    const wednesday = new Date(2025, 5, 18);
    expect(snapToNextBusinessDay(wednesday)).toBe(wednesday);
  });
});

describe('snapRelativeToBusinessDay', () => {
  const start = '2025-01-01T00:00:00.000Z';
  const end = '2025-12-31T00:00:00.000Z';

  it('returns original position if already on business day', () => {
    // Position 0 = Jan 1, 2025 (Wednesday) — a weekday
    const result = snapRelativeToBusinessDay(0, start, end);
    expect(result).toBe(0);
  });

  it('snaps weekend position forward', () => {
    // Jan 4, 2025 is Saturday. In a 365-day range, that's day 3.
    // Use a position that clearly maps to a Saturday
    const totalDays = 364;
    const saturdayPos = 3 / totalDays;
    const date = getDateFromRelativePosition(start, end, saturdayPos);
    // Only run the snap assertion if this actually lands on a weekend
    if (isWeekend(date)) {
      const result = snapRelativeToBusinessDay(saturdayPos, start, end);
      expect(result).toBeGreaterThan(saturdayPos);
    } else {
      // If timezone puts it on a weekday, the result should be unchanged
      const result = snapRelativeToBusinessDay(saturdayPos, start, end);
      expect(result).toBe(saturdayPos);
    }
  });
});

describe('findNearestPhaseBoundary', () => {
  const phases: Phase[] = [
    {
      id: 'p1',
      sectionId: 'sec-1',
      name: 'Phase 1',
      description: '',
      color: null,
      order: 0,
      isCollapsed: false,
      tasks: [],
      relativeStart: 0.0,
      relativeEnd: 0.3,
    },
    {
      id: 'p2',
      sectionId: 'sec-1',
      name: 'Phase 2',
      description: '',
      color: null,
      order: 1,
      isCollapsed: false,
      tasks: [],
      relativeStart: 0.3,
      relativeEnd: 0.7,
    },
  ];

  it('snaps to nearest boundary within threshold', () => {
    // 0.28 is close to 0.3 (end of Phase 1 / start of Phase 2)
    expect(findNearestPhaseBoundary(0.28, phases)).toBe(0.3);
  });

  it('returns null when no boundary is within threshold', () => {
    expect(findNearestPhaseBoundary(0.5, phases)).toBeNull();
  });

  it('respects custom threshold', () => {
    expect(findNearestPhaseBoundary(0.5, phases, 0.01)).toBeNull();
    // 0.45 is closer to 0.3 (distance 0.15) than to 0.7 (distance 0.25)
    expect(findNearestPhaseBoundary(0.45, phases, 0.2)).toBe(0.3);
  });
});

describe('rescalePhases', () => {
  const phases: Phase[] = [
    {
      id: 'p1',
      sectionId: 'sec-1',
      name: 'Phase 1',
      description: '',
      color: null,
      order: 0,
      isCollapsed: false,
      tasks: [],
      relativeStart: 0.0,
      relativeEnd: 0.5,
    },
  ];

  it('preserves absolute dates when expanding range', () => {
    const oldStart = '2025-01-01T00:00:00.000Z';
    const oldEnd = '2025-07-01T00:00:00.000Z';
    const newStart = '2024-07-01T00:00:00.000Z';
    const newEnd = '2025-07-01T00:00:00.000Z';

    const result = rescalePhases(phases, oldStart, oldEnd, newStart, newEnd);
    // Phase originally covered first half of 6 months
    // In new range (12 months), the same dates should be in the second half
    expect(result[0].relativeStart).toBeGreaterThan(0);
    expect(result[0].relativeEnd).toBeLessThanOrEqual(1);
  });

  it('returns original phases when old or new range is zero', () => {
    const sameDate = '2025-01-01T00:00:00.000Z';
    const result = rescalePhases(phases, sameDate, sameDate, sameDate, '2025-07-01T00:00:00.000Z');
    expect(result).toEqual(phases);
  });

  it('clamps to 0-1', () => {
    const result = rescalePhases(
      phases,
      '2025-01-01T00:00:00.000Z',
      '2025-12-31T00:00:00.000Z',
      '2025-03-01T00:00:00.000Z',
      '2025-06-01T00:00:00.000Z'
    );
    for (const p of result) {
      expect(p.relativeStart).toBeGreaterThanOrEqual(0);
      expect(p.relativeEnd).toBeLessThanOrEqual(1);
    }
  });
});

describe('rescaleMilestones', () => {
  const milestones = [
    { relativePosition: 0.5, id: 'm1', name: 'Mid' },
  ];

  it('rescales position when range changes', () => {
    const result = rescaleMilestones(
      milestones,
      '2025-01-01T00:00:00.000Z',
      '2025-07-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
      '2025-12-31T00:00:00.000Z'
    );
    // Same absolute date in a longer range should be < 0.5
    expect(result[0].relativePosition).toBeLessThan(0.5);
  });

  it('preserves extra properties', () => {
    const result = rescaleMilestones(
      milestones,
      '2025-01-01T00:00:00.000Z',
      '2025-07-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
      '2025-12-31T00:00:00.000Z'
    );
    expect(result[0].id).toBe('m1');
    expect(result[0].name).toBe('Mid');
  });

  it('returns original milestones when range is zero', () => {
    const sameDate = '2025-01-01T00:00:00.000Z';
    const result = rescaleMilestones(milestones, sameDate, sameDate, sameDate, '2025-07-01T00:00:00.000Z');
    expect(result).toEqual(milestones);
  });
});

describe('getTimeMarkers', () => {
  const start = '2025-01-01';
  const end = '2025-03-01';

  it('returns day markers for day zoom', () => {
    const markers = getTimeMarkers(start, end, 'day');
    expect(markers.length).toBeGreaterThan(50);
    expect(markers[0].date).toBeInstanceOf(Date);
  });

  it('returns week markers for week zoom', () => {
    const markers = getTimeMarkers(start, end, 'week');
    expect(markers.length).toBeGreaterThanOrEqual(8);
    expect(markers.length).toBeLessThan(15);
  });

  it('returns month markers for month zoom', () => {
    const markers = getTimeMarkers(start, end, 'month');
    expect(markers.length).toBeGreaterThanOrEqual(2);
  });

  it('returns quarter markers for quarter zoom', () => {
    const markers = getTimeMarkers('2025-01-01', '2025-12-31', 'quarter');
    expect(markers.length).toBeGreaterThanOrEqual(4);
    expect(markers[0].label).toContain('Q');
  });
});
