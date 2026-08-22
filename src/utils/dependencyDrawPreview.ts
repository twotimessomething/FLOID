/**
 * The line in flight while a dependency is being drawn.
 *
 * Like the drag preview, it lives outside React and is written to directly:
 * the pointer moves sixty times a second and none of those frames should
 * re-render a row. It is a sketch until it finds a bar — dashed, following the
 * cursor — and becomes a committed-looking line the moment it snaps to an
 * anchor, so the hand knows before it lets go.
 */

export interface DependencyDrawPreview {
  /** Fixed end, moving end, and whether the moving end has snapped to an anchor. */
  update: (x1: number, y1: number, x2: number, y2: number, snapped: boolean) => void;
  destroy: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createDependencyDrawPreview(): DependencyDrawPreview {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'fixed';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '9999';
  svg.style.overflow = 'visible';

  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('stroke-width', '1.25');
  line.setAttribute('fill', 'none');

  const originDot = document.createElementNS(SVG_NS, 'circle');
  originDot.setAttribute('r', '2.5');

  const targetDot = document.createElementNS(SVG_NS, 'circle');
  targetDot.setAttribute('r', '3');

  svg.appendChild(line);
  svg.appendChild(originDot);
  svg.appendChild(targetDot);
  document.body.appendChild(svg);

  let frame = 0;
  let pending: { x1: number; y1: number; x2: number; y2: number; snapped: boolean } | null = null;

  const flush = (): void => {
    frame = 0;
    if (!pending) return;
    const { x1, y1, x2, y2, snapped } = pending;
    pending = null;

    const ink = snapped ? 'var(--color-text-primary)' : 'var(--color-text-secondary)';
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', ink);
    if (snapped) line.removeAttribute('stroke-dasharray');
    else line.setAttribute('stroke-dasharray', '4 4');

    originDot.setAttribute('cx', String(x1));
    originDot.setAttribute('cy', String(y1));
    originDot.setAttribute('fill', ink);

    targetDot.setAttribute('cx', String(x2));
    targetDot.setAttribute('cy', String(y2));
    targetDot.setAttribute('fill', ink);
    targetDot.style.display = snapped ? '' : 'none';
  };

  return {
    update: (x1, y1, x2, y2, snapped) => {
      pending = { x1, y1, x2, y2, snapped };
      if (frame === 0) frame = requestAnimationFrame(flush);
    },
    destroy: () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      pending = null;
      svg.remove();
    },
  };
}
