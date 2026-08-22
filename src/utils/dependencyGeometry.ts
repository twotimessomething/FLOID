import type {
  DependencyAnchor,
  DependencyEdge,
  Section,
  TimelineItem,
  ViewportBounds,
} from '../types/timeline';
import {
  ROW_HEIGHT,
  SECTION_HAIRLINE,
  calculateSectionHeight,
  dayToX,
  flattenSection,
  getBarRect,
  headerMilestones,
} from './timelineUtils';
import { forEachItem } from './itemTree';

/**
 * Where dependency ink goes on the sheet.
 *
 * Everything here is derived from the same `flattenSection` walk the rows draw
 * from, so a connector can never point at a row that is not where it claims.
 * A connector runs dot to dot — it never touches the bars themselves — and its
 * corners are square, like everything else printed on this paper.
 */

/** A connector terminal sits this far outside a bar's edge — past the resize handle. */
export const DEP_DOT_OFFSET = 18;
/** Horizontal run a connector takes before its first corner. */
const STUB = 10;
/** How far below a shared row a doubled-back connector routes. */
const SAME_ROW_CLEARANCE = 16;
/** Half the milestone glyph, plus a breath. */
const MILESTONE_CLEARANCE = 6;

export interface ItemPoint {
  readonly item: TimelineItem;
  /** Vertical centre of the row this item prints on — or of the visible
   * ancestor's row when the item is folded away inside a collapsed group. */
  readonly y: number;
}

/**
 * Row centre for every item on the sheet, in the order the sections render.
 * A hidden item borrows its nearest visible ancestor's row; a collapsed
 * schedule folds everything onto its own header row, tape and markers alike.
 */
export function computeItemPoints(sections: readonly Section[]): Map<string, ItemPoint> {
  const points = new Map<string, ItemPoint>();
  let top = 0;

  for (const section of sections) {
    // Every schedule prints under a hairline, and its rows begin below it
    top += SECTION_HAIRLINE;
    const headerCenter = top + ROW_HEIGHT / 2;

    for (const milestone of headerMilestones(section)) {
      points.set(milestone.id, { item: milestone, y: headerCenter });
    }

    for (const row of flattenSection(section)) {
      points.set(row.item.id, { item: row.item, y: top + ROW_HEIGHT + row.top + row.height / 2 });
    }

    // Parents are visited before children, so a hidden item's parent has
    // already resolved to whichever visible row is standing in for it.
    forEachItem(section.items, (item, parent) => {
      if (points.has(item.id)) return;
      const y = parent ? (points.get(parent.id)?.y ?? headerCenter) : headerCenter;
      points.set(item.id, { item, y });
    });

    top += calculateSectionHeight(section);
  }

  return points;
}

export interface EndpointGeometry {
  /** Terminal dot centre, sheet coordinates. */
  readonly x: number;
  readonly y: number;
  /** Which side the connector leaves or enters from: +1 right, -1 left. */
  readonly away: 1 | -1;
}

/**
 * Resolve both terminals of an edge. A bar's terminal is its hover dot, held
 * just outside the anchored edge; a milestone's is beside the glyph, on
 * whichever side faces the other end — a point has no start or end side.
 */
export function resolveEndpoints(
  edge: DependencyEdge,
  fromPoint: ItemPoint,
  toPoint: ItemPoint,
  viewport: ViewportBounds,
  pixelsPerDay: number
): { from: EndpointGeometry; to: EndpointGeometry } {
  const rawX = (point: ItemPoint, anchor: DependencyAnchor): number => {
    if (point.item.kind === 'milestone') return dayToX(point.item.start, viewport, pixelsPerDay);
    const rect = getBarRect(point.item, viewport, pixelsPerDay);
    return anchor === 'start' ? rect.left : rect.left + rect.width;
  };

  const fromX = rawX(fromPoint, edge.fromAnchor);
  const toX = rawX(toPoint, edge.toAnchor);

  const side = (point: ItemPoint, anchor: DependencyAnchor, otherX: number, ownX: number): 1 | -1 => {
    if (point.item.kind === 'milestone') return otherX >= ownX ? 1 : -1;
    return anchor === 'end' ? 1 : -1;
  };

  const fromAway = side(fromPoint, edge.fromAnchor, toX, fromX);
  const toAway = side(toPoint, edge.toAnchor, fromX, toX);

  const offset = (point: ItemPoint): number =>
    point.item.kind === 'milestone' ? MILESTONE_CLEARANCE : DEP_DOT_OFFSET;

  return {
    from: { x: fromX + fromAway * offset(fromPoint), y: fromPoint.y, away: fromAway },
    to: { x: toX + toAway * offset(toPoint), y: toPoint.y, away: toAway },
  };
}

/**
 * The elbow route between two terminals: out, over, in — square corners only.
 * Three segments when the approach lands from the arrow's own side; five when
 * the connector has to double back, or when both ends share a row and the
 * straight line would run the wrong way.
 */
export function routeConnector(from: EndpointGeometry, to: EndpointGeometry): string {
  const p1x = from.x + from.away * STUB;
  const p4x = to.x + to.away * STUB;

  if (from.y === to.y) {
    const travel = Math.sign(to.x - from.x) || 1;
    const agreeable = from.away === travel && to.away === -travel;
    if (agreeable && Math.abs(to.x - from.x) >= 2 * STUB) {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }
    const my = from.y + SAME_ROW_CLEARANCE;
    return (
      `M ${from.x} ${from.y} L ${p1x} ${from.y} L ${p1x} ${my}` +
      ` L ${p4x} ${my} L ${p4x} ${to.y} L ${to.x} ${to.y}`
    );
  }

  const finalDir = Math.sign(to.x - p1x) || 1;
  if (finalDir === -to.away && Math.abs(to.x - p1x) >= STUB) {
    return `M ${from.x} ${from.y} L ${p1x} ${from.y} L ${p1x} ${to.y} L ${to.x} ${to.y}`;
  }

  const my = (from.y + to.y) / 2;
  return (
    `M ${from.x} ${from.y} L ${p1x} ${from.y} L ${p1x} ${my}` +
    ` L ${p4x} ${my} L ${p4x} ${to.y} L ${to.x} ${to.y}`
  );
}

/** Small solid triangle at the target terminal, pointing the way in. */
export function arrowheadPath(to: EndpointGeometry): string {
  const d = -to.away; // into the bar
  return `M ${to.x} ${to.y} l ${-d * 6} -3.5 v 7 z`;
}
