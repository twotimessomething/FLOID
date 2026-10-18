import { describe, it, expect } from 'vitest';
import { placeFloatingPanel } from '../utils/floatingPanel';

const base = {
  width: 280,
  viewportWidth: 1440,
  viewportHeight: 900,
  padding: 16,
  flipGap: 8,
};

describe('placeFloatingPanel', () => {
  it('may be as tall as the window less its margins', () => {
    const { maxHeight } = placeFloatingPanel({ ...base, anchorX: 100, anchorY: 100, height: 600 });
    expect(maxHeight).toBe(868);
  });

  it('opens at the anchor when it fits', () => {
    expect(placeFloatingPanel({ ...base, anchorX: 100, anchorY: 100, height: 600 })).toMatchObject(
      { left: 100, top: 100 }
    );
  });

  it('moves up rather than running off the bottom', () => {
    const { top } = placeFloatingPanel({ ...base, anchorX: 100, anchorY: 700, height: 600 });
    expect(top).toBe(900 - 600 - 16);
  });

  it('a panel taller than the window fills it from the top margin', () => {
    const { top, maxHeight } = placeFloatingPanel({
      ...base,
      viewportHeight: 500,
      anchorX: 100,
      anchorY: 300,
      height: 700,
    });
    expect(top).toBe(16);
    expect(top + maxHeight).toBe(500 - 16);
  });

  it('flips to the left of the anchor when the right edge is close', () => {
    const { left } = placeFloatingPanel({ ...base, anchorX: 1300, anchorY: 100, height: 400 });
    expect(left).toBe(1300 - 280 - 8);
  });
});
