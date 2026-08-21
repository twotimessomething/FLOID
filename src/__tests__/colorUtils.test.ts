import { describe, it, expect } from 'vitest';
import {
  hexToHsl,
  hslToHex,
  getPhaseColorInRange,
  getReadableTextColor,
} from '../utils/colorUtils';
import { PHASE_COLORS } from '../constants/colors';

describe('hexToHsl', () => {
  it('converts pure red', () => {
    const hsl = hexToHsl('#ff0000');
    expect(hsl.h).toBeCloseTo(0, 0);
    expect(hsl.s).toBeCloseTo(100, 0);
    expect(hsl.l).toBeCloseTo(50, 0);
  });

  it('converts pure green', () => {
    const hsl = hexToHsl('#00ff00');
    expect(hsl.h).toBeCloseTo(120, 0);
    expect(hsl.s).toBeCloseTo(100, 0);
    expect(hsl.l).toBeCloseTo(50, 0);
  });

  it('converts pure blue', () => {
    const hsl = hexToHsl('#0000ff');
    expect(hsl.h).toBeCloseTo(240, 0);
    expect(hsl.s).toBeCloseTo(100, 0);
    expect(hsl.l).toBeCloseTo(50, 0);
  });

  it('converts white', () => {
    const hsl = hexToHsl('#ffffff');
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBeCloseTo(100, 0);
  });

  it('converts black', () => {
    const hsl = hexToHsl('#000000');
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBeCloseTo(0, 0);
  });

  it('converts gray (achromatic)', () => {
    const hsl = hexToHsl('#808080');
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBeCloseTo(50, 0);
  });

  it('handles hex without #', () => {
    const hsl = hexToHsl('ff0000');
    expect(hsl.h).toBeCloseTo(0, 0);
    expect(hsl.s).toBeCloseTo(100, 0);
  });
});

describe('hslToHex', () => {
  it('converts pure red HSL back to hex', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
  });

  it('converts pure green HSL back to hex', () => {
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
  });

  it('converts pure blue HSL back to hex', () => {
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });

  it('handles negative hue', () => {
    // -60 degrees should be equivalent to 300 degrees
    const result = hslToHex(-60, 100, 50);
    const expected = hslToHex(300, 100, 50);
    expect(result).toBe(expected);
  });

  it('clamps saturation and lightness', () => {
    // Should not throw with out-of-range values
    expect(() => hslToHex(0, 150, 50)).not.toThrow();
    expect(() => hslToHex(0, -10, 50)).not.toThrow();
  });
});

describe('hexToHsl + hslToHex round-trip', () => {
  const testColors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'];

  for (const hex of testColors) {
    it(`round-trips ${hex}`, () => {
      const hsl = hexToHsl(hex);
      const result = hslToHex(hsl.h, hsl.s, hsl.l);
      // Allow for minor rounding differences
      expect(result.toLowerCase()).toBe(hex.toLowerCase());
    });
  }
});

describe('getPhaseColorInRange', () => {
  const baseColor = '#3b82f6';

  it('returns base color for single phase', () => {
    expect(getPhaseColorInRange(baseColor, 0, 1)).toBe(baseColor);
  });

  it('returns base color for negative index', () => {
    expect(getPhaseColorInRange(baseColor, -1, 5)).toBe(baseColor);
  });

  it('returns base color for first phase', () => {
    const result = getPhaseColorInRange(baseColor, 0, 5);
    expect(result).toBe(baseColor);
  });

  it('returns different color for last phase', () => {
    const result = getPhaseColorInRange(baseColor, 4, 5);
    expect(result).not.toBe(baseColor);
  });

  it('produces a gradient across phases', () => {
    const colors = Array.from({ length: 5 }, (_, i) =>
      getPhaseColorInRange(baseColor, i, 5)
    );
    // All colors should be valid hex strings
    for (const c of colors) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // First and last should differ
    expect(colors[0]).not.toBe(colors[4]);
  });
});

describe('getReadableTextColor', () => {
  const INK = '#17171A';
  const PAPER = '#FFFFFF';

  it('puts ink on light and cool mid-tone bars', () => {
    expect(getReadableTextColor(PHASE_COLORS.teal)).toBe(INK);
    expect(getReadableTextColor(PHASE_COLORS.sky)).toBe(INK);
    expect(getReadableTextColor(PHASE_COLORS.pink)).toBe(INK);
    expect(getReadableTextColor(PHASE_COLORS.ochre)).toBe(INK);
  });

  it('puts paper on dark bars', () => {
    expect(getReadableTextColor(PHASE_COLORS.blue)).toBe(PAPER);
    expect(getReadableTextColor(PHASE_COLORS.indigo)).toBe(PAPER);
    expect(getReadableTextColor(PHASE_COLORS.plum)).toBe(PAPER);
  });

  it('puts paper on saturated red and orange despite ink measuring higher', () => {
    expect(getReadableTextColor(PHASE_COLORS.red)).toBe(PAPER);
    expect(getReadableTextColor(PHASE_COLORS.orange)).toBe(PAPER);
  });

  it('keeps one label color across a warm schedule gradient', () => {
    for (const base of [PHASE_COLORS.red, PHASE_COLORS.orange]) {
      const colors = Array.from({ length: 5 }, (_, i) => getPhaseColorInRange(base, i, 5));
      for (const c of colors) {
        expect(getReadableTextColor(c)).toBe(PAPER);
      }
    }
  });

  it('keeps ink on a cool gradient that dips below the warm crossover', () => {
    const colors = Array.from({ length: 5 }, (_, i) =>
      getPhaseColorInRange(PHASE_COLORS.teal, i, 5)
    );
    for (const c of colors) {
      expect(getReadableTextColor(c)).toBe(INK);
    }
  });

  it('leaves pale warm tints on ink', () => {
    expect(getReadableTextColor('#F7D9C4')).toBe(INK);
    expect(getReadableTextColor('#F5A623')).toBe(INK);
  });

  it('ignores hue for washed-out warms', () => {
    // Low saturation: falls back to the measured crossover, which picks ink.
    expect(getReadableTextColor('#9C8F86')).toBe(INK);
  });

  it('falls back to ink for malformed input', () => {
    expect(getReadableTextColor('#abc')).toBe(INK);
  });
});
