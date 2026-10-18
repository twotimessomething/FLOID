import { describe, it, expect } from 'vitest';
import { arcFractions, foldToward, pointAlong } from '../utils/dependencyDrawPreview';

const ELBOW = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 40 },
  { x: 60, y: 40 },
];
const STRAIGHT = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

describe('arcFractions', () => {
  it('places each corner by how far along the line it sits', () => {
    expect(arcFractions(ELBOW)).toEqual([0, 0.1, 0.5, 1]);
  });

  it('spreads the corners evenly when the line has no length', () => {
    expect(
      arcFractions([
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ])
    ).toEqual([0, 0.5, 1]);
  });
});

describe('pointAlong', () => {
  it('walks the polyline, not the straight line between its ends', () => {
    const point = pointAlong(ELBOW, 0.3);
    expect(point.x).toBe(10);
    expect(point.y).toBeCloseTo(20);
  });

  it('clamps to the ends', () => {
    expect(pointAlong(ELBOW, -1)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(ELBOW, 2)).toEqual({ x: 60, y: 40 });
  });
});

describe('foldToward', () => {
  it('lies along the other shape at weight 0, so a fold starts where the line was', () => {
    const folded = foldToward(ELBOW, STRAIGHT, 0);
    expect(folded).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('is the route itself at weight 1, so a fold ends exactly on the printed ink', () => {
    expect(foldToward(ELBOW, STRAIGHT, 1)).toEqual(ELBOW);
  });

  it('keeps one corner per corner of the route the whole way', () => {
    for (const weight of [0, 0.25, 0.5, 0.75, 1]) {
      expect(foldToward(ELBOW, STRAIGHT, weight)).toHaveLength(ELBOW.length);
    }
  });

  it('moves every corner part of the way at an in-between weight', () => {
    const half = foldToward(ELBOW, STRAIGHT, 0.5);
    expect(half[3].x).toBeCloseTo(80);
    expect(half[3].y).toBeCloseTo(20);
  });
});
