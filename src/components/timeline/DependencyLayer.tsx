import { memo, useCallback, useMemo, useRef } from 'react';
import type { DependencyEdge, Section, ViewportBounds } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { isDependencyViolated } from '../../utils/dependencyUtils';
import { reportDependencyHover, reportDependencyLeave } from '../../utils/dependencyHover';
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
  const selectedItemId = useUIStore((s) =>
    s.selection.type === 'item' ? s.selection.id : null
  );
  const selectDependency = useUIStore((s) => s.selectDependency);
  const { startDraw } = useDependencyDraw();

  const points = useMemo(() => computeItemPoints(sections), [sections]);

  const rendered = useMemo((): RenderedEdge[] => {
    const out: RenderedEdge[] = [];
    for (const edge of dependencies) {
      const fromPoint = points.get(edge.from);
      const toPoint = points.get(edge.to);
      if (!fromPoint || !toPoint) continue;

      const violated = isDependencyViolated(edge, fromPoint.item, toPoint.item);
      const revealed =
        violated ||
        edge.id === selectedDependencyId ||
        (hoverItemId !== null && (edge.from === hoverItemId || edge.to === hoverItemId)) ||
        (selectedItemId !== null && (edge.from === selectedItemId || edge.to === selectedItemId));
      if (!revealed) continue;

      const { from, to } = resolveEndpoints(edge, fromPoint, toPoint, viewport, pixelsPerDay);
      out.push({
        edge,
        from,
        to,
        path: routeConnector(from, to),
        arrow: arrowheadPath(to),
        violated,
      });
    }
    return out;
  }, [dependencies, points, hoverItemId, selectedItemId, selectedDependencyId, viewport, pixelsPerDay]);

  /**
   * Which terminals may be picked up. Never the one standing on the item that
   * revealed the line — that spot belongs to the item's own dot, which starts
   * new links. Picking up a terminal moves that end; open paper un-draws it.
   */
  const grabbableEnds = useCallback(
    (r: RenderedEdge): ReadonlyArray<'from' | 'to'> => {
      if (r.edge.id === selectedDependencyId) return ['from', 'to'];
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
    [hoverItemId, selectedItemId, selectedDependencyId]
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
      className="absolute top-0 left-0 pointer-events-none"
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
        return (
          <g key={r.edge.id}>
            <path
              d={r.path}
              fill="none"
              stroke={ink}
              strokeWidth={isSelected ? 1.5 : 1}
              aria-hidden="true"
            />
            <path d={r.arrow} fill={ink} aria-hidden="true" />
            <circle cx={r.from.x} cy={r.from.y} r={2.5} fill={ink} aria-hidden="true" />
            <circle cx={r.to.x} cy={r.to.y} r={2.5} fill={ink} aria-hidden="true" />

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
