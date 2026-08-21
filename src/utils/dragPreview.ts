/**
 * The bar that follows the cursor.
 *
 * It is a clone of the real element, so it is the right size, the right
 * colour and carries the right label without any of that being described
 * twice. It lives outside React and is written to directly — a drag moves the
 * pointer sixty times a second, and none of those frames should re-render a row.
 */

export interface DragPreview {
  moveTo: (x: number, y: number, dateLabel: string) => void;
  destroy: () => void;
}

export function createDragPreview(source: HTMLElement, rect: DOMRect): DragPreview {
  const clone = source.cloneNode(true) as HTMLElement;

  // Affordances belong to the row that stayed behind, not to what is in flight
  clone.querySelectorAll('.drag-handle, [data-strip-on-drag]').forEach((node) => node.remove());

  clone.classList.add('drag-preview');
  // `inset` first: it is shorthand for all four offsets, so setting it after
  // left/top would blank them and drop the clone wherever the static flow puts it.
  clone.style.inset = 'auto';
  clone.style.position = 'fixed';
  clone.style.left = '0';
  clone.style.top = '0';
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '9999';
  clone.style.willChange = 'transform';

  // Overprinting is right on the sheet; over the page it just looks muddy
  clone.querySelectorAll<HTMLElement>('.timeline-bar__fill').forEach((fill) => {
    fill.style.mixBlendMode = 'normal';
  });

  const bubble = document.createElement('span');
  bubble.className = 'drag-preview__date';
  clone.appendChild(bubble);

  document.body.appendChild(clone);

  let frame = 0;
  let pending: { x: number; y: number; label: string } | null = null;

  const flush = (): void => {
    frame = 0;
    if (!pending) return;
    clone.style.transform = `translate3d(${pending.x}px, ${pending.y}px, 0)`;
    if (bubble.textContent !== pending.label) bubble.textContent = pending.label;
    pending = null;
  };

  return {
    moveTo: (x, y, dateLabel) => {
      pending = { x, y, label: dateLabel };
      if (frame === 0) frame = requestAnimationFrame(flush);
    },
    destroy: () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      clone.remove();
    },
  };
}
