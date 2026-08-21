/**
 * The bar that follows the cursor.
 *
 * It is a clone of the real element, so it is the right size, the right
 * colour and carries the right label without any of that being described
 * twice. It lives outside React and is written to directly — a drag moves the
 * pointer sixty times a second, and none of those frames should re-render a row.
 */

/** Where a released clone flies to: the rect the real bar landed on. */
export interface SettleTarget {
  readonly left: number;
  readonly top: number;
  readonly height: number;
}

export interface DragPreview {
  moveTo: (x: number, y: number, dateLabel: string) => void;
  /**
   * Fly to where the item actually landed, fade out on top of it, and remove.
   * Falls back to `destroy` when the flight would be a lie or an imposition —
   * a hop too short to read, or a user who asked for less motion.
   */
  settleTo: (target: SettleTarget) => void;
  destroy: () => void;
}

/** The flight. Long enough to follow with the eye, short enough to ignore. */
const SETTLE_MS = 140;
/** The fade happens on arrival, over the real bar it has just met. */
const SETTLE_FADE_MS = 60;
/** Below this the clone is already where the bar is. Cut, do not fly. */
const SETTLE_MIN_TRAVEL_PX = 8;

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
  // Where the clone was last painted — the point any flight starts from.
  let painted = { x: 0, y: 0 };

  const flush = (): void => {
    frame = 0;
    if (!pending) return;
    clone.style.transform = `translate3d(${pending.x}px, ${pending.y}px, 0)`;
    if (bubble.textContent !== pending.label) bubble.textContent = pending.label;
    painted = { x: pending.x, y: pending.y };
    pending = null;
  };

  const stop = (): void => {
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    pending = null;
  };

  return {
    moveTo: (x, y, dateLabel) => {
      pending = { x, y, label: dateLabel };
      if (frame === 0) frame = requestAnimationFrame(flush);
    },
    settleTo: (target) => {
      stop();

      const travel = Math.hypot(target.left - painted.x, target.top - painted.y);
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (reduced || travel < SETTLE_MIN_TRAVEL_PX) {
        clone.remove();
        return;
      }

      // The date bubble has said its piece; it is not part of the landing.
      bubble.remove();
      clone.style.transition =
        `transform ${SETTLE_MS}ms var(--ease-out),` +
        ` height ${SETTLE_MS}ms var(--ease-out),` +
        ` opacity ${SETTLE_FADE_MS}ms ease-out ${SETTLE_MS - SETTLE_FADE_MS}ms`;
      clone.style.transform = `translate3d(${target.left}px, ${target.top}px, 0)`;
      clone.style.height = `${target.height}px`;
      clone.style.opacity = '0';
      window.setTimeout(() => clone.remove(), SETTLE_MS + 20);
    },
    destroy: () => {
      stop();
      clone.remove();
    },
  };
}
