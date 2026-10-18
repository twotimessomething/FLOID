import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DependencyEdge, Section, ViewportBounds } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { isDependencyViolated } from '../../utils/dependencyUtils';
import {
  LINK_EXIT_MS,
  NO_DEPARTURES,
  expireDepartures,
  isEdgeRevealed,
  reportDependencyHover,
  reportDependencyLeave,
  trackDepartures,
  useHeldDependency,
  type HeldDependency,
} from '../../utils/dependencyHover';
import { prefersReducedMotion } from '../../utils/easing';
import {
  arrowheadPath,
  computeItemPoints,
  resolveEndpoints,
  routeConnector,
  type EndpointGeometry,
} from '../../utils/dependencyGeometry';
import { useDependencyDraw } from '../../hooks/useDependencyDraw';

interface DependencyLayerProps {
  /** Every schedule, in the order the sheet stacks them — pinned first. */
  readonly sections: readonly Section[];
  readonly viewport: ViewportBounds;
  readonly pixelsPerDay: number;
  readonly width: number;
  readonly height: number;
}

interface RenderedEdge {
  readonly edge: DependencyEdge;
  readonly from: EndpointGeometry;
  readonly to: EndpointGeometry;
  readonly path: string;
  readonly arrow: string;
  readonly violated: boolean;
}

const INK_TRANSITION = 'opacity var(--duration-fast) linear';
/** Its end is in the hand: the route drains away under the line being drawn. */
const DRAINED_INK: React.CSSProperties = { opacity: 0, transition: INK_TRANSITION };
/** The line in flight is folding into this route; it mounts with no ink of its own. */
const HIDDEN_INK: React.CSSProperties = { opacity: 0 };
/** The fold has arrived; the route's own ink comes back in under it. */
const INKED_INK: React.CSSProperties = { opacity: 1, transition: INK_TRANSITION };
/** No longer revealed: on its way off the sheet. */
const LEAVING: React.CSSProperties = { opacity: 0, transition: INK_TRANSITION };
/**
 * On the sheet. Opacity is the default, so a link that mounts here simply
 * appears — but one revealed again half-way through leaving is the same node,
 * and the transition carries it back up from wherever its fade had got to
 * instead of snapping to full ink.
 */
const SHOWN: React.CSSProperties = { transition: INK_TRANSITION };

function heldInk(held: HeldDependency | null, edgeId: string): React.CSSProperties | undefined {
  if (held?.edgeId !== edgeId) return undefined;
  if (held.ink === 'drained') return DRAINED_INK;
  if (held.ink === 'hidden') return HIDDEN_INK;
  return INKED_INK;
}

/**
 * Every dependency the sheet is currently showing, drawn in one layer.
 *
 * Connectors hide by default — the printed dots on the bars are the only
 * standing evidence. Hovering or selecting an item reveals its own links, and
 * a violated link stays printed until someone drags the work back into order:
 * that one line earning its ink is the entire point of having drawn it.
 *
 * The geometry walks the same `flattenSection` layout the rows render from,
 * so a line cannot disagree with the sheet about where an item is.
 *
 * A link a gesture is holding (`useHeldDependency`) is on the sheet whatever
 * hover says — its terminal may own the pointer capture, and unmounting it
 * mid-drag would drop the gesture's target out from under the hand — and its
 * ink rides the gesture: drained while its end is being moved, held back while
 * the drawn line folds into it, faded back in when the fold arrives.
 *
 * And no link is ever unmounted in the frame its reveal ends. It stays for
 * the length of a fade, its ink going out and its hit areas already gone, so
 * moving the pointer on — or a linger running out — reads as the line being
 * put away rather than switched off.
 */
export const DependencyLayer = memo(function DependencyLayer({
  sections,
  viewport,
  pixelsPerDay,
  width,
  height,
}: DependencyLayerProps): JSX.Element | null {
  const svgRef = useRef<SVGSVGElement>(null);
  const dependencies = useSectionStore((s) => s.dependencies);
  const hoverItemId = useUIStore((s) => s.dependencyHoverItemId);
  const selectedDependencyId = useUIStore((s) => s.selectedDependencyId);
  const selectedItemId = useUIStore((s) => (s.selection.type === 'item' ? s.selection.id : null));
  const selectDependency = useUIStore((s) => s.selectDependency);
  const held = useHeldDependency();
  const { startDraw } = useDependencyDraw();

  const points = useMemo(() => computeItemPoints(sections), [sections]);
  const heldEdgeId = held?.edgeId ?? null;
  const heldEnd = held?.end ?? null;

  /** Every link the sheet shows right now, by the reveal rule or a gesture's hold. */
  const revealedIds = useMemo((): ReadonlySet<string> => {
    const ids = new Set<string>();
    for (const edge of dependencies) {
      const fromPoint = points.get(edge.from);
      const toPoint = points.get(edge.to);
      if (!fromPoint || !toPoint) continue;
      const violated = isDependencyViolated(edge, fromPoint.item, toPoint.item);
      if (
        edge.id === heldEdgeId ||
        isEdgeRevealed(edge, violated, { hoverItemId, selectedItemId, selectedDependencyId })
      ) {
        ids.add(edge.id);
      }
    }
    return ids;
  }, [dependencies, points, hoverItemId, selectedItemId, selectedDependencyId, heldEdgeId]);

  // Links that stopped being revealed, kept for their fade. Worked out while
  // rendering — from the set this layer showed last time — so a departing
  // link's element is never unmounted for even one commit: its opacity can
  // only transition out if it is the same node that was showing it.
  const [shownBefore, setShownBefore] = useState(revealedIds);
  const [leaving, setLeaving] = useState(NO_DEPARTURES);
  if (shownBefore !== revealedIds) {
    setShownBefore(revealedIds);
    // Asked for less motion: a link is simply put away
    const next = prefersReducedMotion()
      ? NO_DEPARTURES
      : trackDepartures(shownBefore, revealedIds, leaving, performance.now());
    if (next !== leaving) setLeaving(next);
  }

  useEffect(() => {
    if (leaving.size === 0) return;
    // Expire as of the moment this timer was set for, not the clock reading
    // when it fires: a timer a hair early would otherwise expire nothing,
    // change nothing, and never be set again.
    const firstOut = Math.min(...leaving.values()) + LINK_EXIT_MS;
    const timer = window.setTimeout(
      () => setLeaving((current) => expireDepartures(current, firstOut)),
      Math.max(0, firstOut - performance.now())
    );
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const rendered = useMemo((): RenderedEdge[] => {
    const out: RenderedEdge[] = [];
    for (const edge of dependencies) {
      if (!revealedIds.has(edge.id) && !leaving.has(edge.id)) continue;
      const fromPoint = points.get(edge.from);
      const toPoint = points.get(edge.to);
      if (!fromPoint || !toPoint) continue;

      const { from, to } = resolveEndpoints(edge, fromPoint, toPoint, viewport, pixelsPerDay);
      out.push({
        edge,
        from,
        to,
        path: routeConnector(from, to),
        arrow: arrowheadPath(to),
        violated: isDependencyViolated(edge, fromPoint.item, toPoint.item),
      });
    }
    return out;
  }, [dependencies, points, revealedIds, leaving, viewport, pixelsPerDay]);

  /**
   * Which terminals may be picked up. Never the one standing on the item that
   * revealed the line — that spot belongs to the item's own dot, which starts
   * new links. Picking up a terminal moves that end; open paper un-draws it.
   * The end in the hand always keeps its terminal: it holds the capture.
   */
  const grabbableEnds = useCallback(
    (r: RenderedEdge): ReadonlyArray<'from' | 'to'> => {
      if (r.edge.id === selectedDependencyId) return ['from', 'to'];
      if (r.edge.id === heldEdgeId && heldEnd) return [heldEnd];
      const source =
        hoverItemId && (r.edge.from === hoverItemId || r.edge.to === hoverItemId)
          ? hoverItemId
          : selectedItemId && (r.edge.from === selectedItemId || r.edge.to === selectedItemId)
            ? selectedItemId
            : null;
      if (!source) return [];
      const ends: Array<'from' | 'to'> = [];
      if (r.edge.from !== source) ends.push('from');
      if (r.edge.to !== source) ends.push('to');
      return ends;
    },
    [hoverItemId, selectedItemId, selectedDependencyId, heldEdgeId, heldEnd]
  );

  const handleTerminalPointerDown = useCallback(
    (e: React.PointerEvent, r: RenderedEdge, grabbed: 'from' | 'to'): void => {
      if (e.button !== 0) return;
      // A press on a terminal is a gesture, never the start of a text selection
      e.preventDefault();
      e.stopPropagation();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const fixedEnd = grabbed === 'from' ? 'to' : 'from';
      const fixedGeom = fixedEnd === 'from' ? r.from : r.to;
      startDraw(e, {
        origin: { x: rect.left + fixedGeom.x, y: rect.top + fixedGeom.y },
        // The pinned end is a point on this layer, not on the terminal pressed
        originFrame: svg,
        fixed: {
          end: fixedEnd,
          itemId: fixedEnd === 'from' ? r.edge.from : r.edge.to,
          anchor: fixedEnd === 'from' ? r.edge.fromAnchor : r.edge.toAnchor,
        },
        edgeId: r.edge.id,
      });
    },
    [startDraw]
  );

  const handleLineClick = useCallback(
    (e: React.MouseEvent, edgeId: string): void => {
      e.stopPropagation();
      selectDependency(edgeId);
    },
    [selectDependency]
  );

  /**
   * The sheet is a drag surface, so a press starting on a line must not become
   * a native text-selection drag — preventing the default suppresses the
   * compatibility mousedown that starts one, while click still fires for the
   * selection above. The same press also stays out of the pan's way.
   */
  const handleLinePointerDown = useCallback((e: React.PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * Which end a line hands the hover to. Whichever end already holds it, so
   * reaching from a bar onto one of its lines keeps that bar's whole set on
   * the sheet — reporting the source end regardless would swap the set to the
   * other item's links and take the neighbouring lines away mid-reach. Leave
   * resolves to the same id enter set, which is what lets the linger clear.
   */
  const hoverEndOf = useCallback(
    (edge: DependencyEdge): string => {
      if (hoverItemId && (edge.from === hoverItemId || edge.to === hoverItemId)) return hoverItemId;
      if (selectedItemId && (edge.from === selectedItemId || edge.to === selectedItemId)) {
        return selectedItemId;
      }
      return edge.from;
    },
    [hoverItemId, selectedItemId]
  );

  const handleLineEnter = useCallback(
    (e: React.PointerEvent, r: RenderedEdge): void => {
      if (e.pointerType === 'mouse') reportDependencyHover(hoverEndOf(r.edge));
    },
    [hoverEndOf]
  );
  const handleLineLeave = useCallback(
    (e: React.PointerEvent, r: RenderedEdge): void => {
      if (e.pointerType === 'mouse') reportDependencyLeave(hoverEndOf(r.edge));
    },
    [hoverEndOf]
  );

  if (rendered.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      className="dependency-layer absolute top-0 left-0 pointer-events-none"
      width={width}
      height={height}
      style={{ overflow: 'visible' }}
      role="presentation"
    >
      {rendered.map((r) => {
        const isSelected = r.edge.id === selectedDependencyId;
        const ink = r.violated
          ? 'var(--color-danger)'
          : isSelected
            ? 'var(--color-text-primary)'
            : 'var(--color-text-secondary)';
        if (leaving.has(r.edge.id) && !revealedIds.has(r.edge.id)) {
          // Ink only, fading: nothing on its way out can be grabbed or hovered
          return (
            <g key={r.edge.id} data-dep-leaving={r.edge.id} style={LEAVING} aria-hidden="true">
              <g>
                <path d={r.path} fill="none" stroke={ink} strokeWidth={1} />
                <path d={r.arrow} fill={ink} />
                <circle cx={r.from.x} cy={r.from.y} r={2.5} fill={ink} />
                <circle cx={r.to.x} cy={r.to.y} r={2.5} fill={ink} />
              </g>
            </g>
          );
        }
        return (
          <g key={r.edge.id} data-dep-edge={r.edge.id} style={SHOWN}>
            <g style={heldInk(held, r.edge.id)}>
              <path
                d={r.path}
                fill="none"
                stroke={ink}
                strokeWidth={isSelected ? 1.5 : 1}
                data-dep-route={r.edge.id}
                aria-hidden="true"
              />
              <path d={r.arrow} fill={ink} aria-hidden="true" />
              <circle cx={r.from.x} cy={r.from.y} r={2.5} fill={ink} aria-hidden="true" />
              <circle cx={r.to.x} cy={r.to.y} r={2.5} fill={ink} aria-hidden="true" />
            </g>

            {/* The grabbable route: click selects, Delete removes */}
            <path
              d={r.path}
              fill="none"
              stroke="transparent"
              strokeWidth={9}
              className="dep-line-hit"
              onPointerDown={handleLinePointerDown}
              onPointerEnter={(e) => handleLineEnter(e, r)}
              onPointerLeave={(e) => handleLineLeave(e, r)}
              onClick={(e) => handleLineClick(e, r.edge.id)}
            />

            {/* A terminal sits on top of the line's own hit area, so reaching
                it is leaving the line: it has to hold the hover itself, or the
                linger runs out while the hand rests on it and takes the line —
                terminal and all — away before the press. */}
            {grabbableEnds(r).map((end) => {
              const geom = end === 'from' ? r.from : r.to;
              return (
                <circle
                  key={end}
                  cx={geom.x}
                  cy={geom.y}
                  r={8}
                  fill="transparent"
                  className="dep-terminal-hit"
                  onPointerDown={(e) => handleTerminalPointerDown(e, r, end)}
                  onPointerEnter={(e) => handleLineEnter(e, r)}
                  onPointerLeave={(e) => handleLineLeave(e, r)}
                  onClick={(e) => e.stopPropagation()}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
});
