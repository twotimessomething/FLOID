import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hexToHsl, hslToHex } from '../../utils/colorUtils';

const POPOVER_WIDTH = 200;
const POPOVER_HEIGHT = 196;
const VIEWPORT_PADDING = 8;
const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

interface CustomColorPopoverProps {
  /** The swatch button this popover hangs off. */
  readonly anchor: HTMLElement | null;
  /** The colour to open on. */
  readonly value: string;
  readonly onChange: (color: string) => void;
  readonly onClose: () => void;
}

/**
 * The custom colour picker.
 *
 * A floating surface, so it is white paper with a shadow and lives in a portal
 * — the swatch grids that open it sit inside modals and menus that clip.
 *
 * It thinks in HSL because the rest of the app does: `getPhaseColorInRange`
 * shifts hue and lightness, so a colour picked here is a colour the gradient
 * ramp can already walk. The field is saturation across and lightness down at
 * the current hue; the strip below is the hue.
 *
 * **A drag commits once, on release.** Undo history is fifty entries deep and a
 * pointer drag would spend all of them in a second, so the field previews
 * against local state and only the colour let go of reaches the store.
 */
export function CustomColorPopover({
  anchor,
  value,
  onChange,
  onClose,
}: CustomColorPopoverProps): JSX.Element | null {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [hsl, setHsl] = useState(() => hexToHsl(value));
  const [hexDraft, setHexDraft] = useState(() => value.toUpperCase());
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const color = hslToHex(hsl.h, hsl.s, hsl.l);

  // Anchor below the swatch, flipping above and clamping sideways at the edges
  useLayoutEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow < POPOVER_HEIGHT + VIEWPORT_PADDING
        ? Math.max(VIEWPORT_PADDING, rect.top - POPOVER_HEIGHT - 6)
        : rect.bottom + 6;
    const left = Math.min(
      Math.max(VIEWPORT_PADDING, rect.left),
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING
    );
    setPosition({ top, left });
  }, [anchor]);

  // Dismiss on outside press or Escape. Deferred so the press that opened it
  // does not close it on the same tick.
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const timeoutId = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown);
    }, 0);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [anchor, onClose]);

  const commit = useCallback(
    (next: { h: number; s: number; l: number }) => {
      const hex = hslToHex(next.h, next.s, next.l);
      setHexDraft(hex.toUpperCase());
      onChange(hex);
    },
    [onChange]
  );

  /** Pointer drags on the field and the strip share one gesture. */
  const trackPointer = useCallback(
    (
      e: React.PointerEvent<HTMLDivElement>,
      read: (rect: DOMRect, clientX: number, clientY: number) => { h: number; s: number; l: number }
    ) => {
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      let latest = read(rect, e.clientX, e.clientY);
      setHsl(latest);
      setHexDraft(hslToHex(latest.h, latest.s, latest.l).toUpperCase());

      const handleMove = (move: PointerEvent): void => {
        latest = read(rect, move.clientX, move.clientY);
        setHsl(latest);
        setHexDraft(hslToHex(latest.h, latest.s, latest.l).toUpperCase());
      };
      const handleUp = (): void => {
        el.removeEventListener('pointermove', handleMove);
        el.removeEventListener('pointerup', handleUp);
        el.removeEventListener('pointercancel', handleCancel);
        commit(latest);
      };
      const handleCancel = (): void => {
        el.removeEventListener('pointermove', handleMove);
        el.removeEventListener('pointerup', handleUp);
        el.removeEventListener('pointercancel', handleCancel);
        setHsl(hexToHsl(value));
        setHexDraft(value.toUpperCase());
      };
      el.addEventListener('pointermove', handleMove);
      el.addEventListener('pointerup', handleUp);
      el.addEventListener('pointercancel', handleCancel);
    },
    [commit, value]
  );

  const handleFieldDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      trackPointer(e, (rect, x, y) => ({
        h: hsl.h,
        s: clampPercent(((x - rect.left) / rect.width) * 100),
        l: clampPercent(100 - ((y - rect.top) / rect.height) * 100),
      }));
    },
    [trackPointer, hsl.h]
  );

  const handleHueDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      trackPointer(e, (rect, x) => ({
        h: Math.max(0, Math.min(360, ((x - rect.left) / rect.width) * 360)),
        s: hsl.s,
        l: hsl.l,
      }));
    },
    [trackPointer, hsl.s, hsl.l]
  );

  const handleHexChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setHexDraft(raw.toUpperCase());
      if (!HEX_PATTERN.test(raw)) return;
      const hex = raw.startsWith('#') ? raw : `#${raw}`;
      setHsl(hexToHsl(hex));
      onChange(hex.toLowerCase());
    },
    [onChange]
  );

  // Arrow keys nudge hue — the field and strip are focusable, so the picker is
  // reachable without a pointer at all.
  const handleFieldKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 10 : 1;
      const next = { ...hsl };
      if (e.key === 'ArrowLeft') next.s = clampPercent(hsl.s - step);
      else if (e.key === 'ArrowRight') next.s = clampPercent(hsl.s + step);
      else if (e.key === 'ArrowUp') next.l = clampPercent(hsl.l + step);
      else if (e.key === 'ArrowDown') next.l = clampPercent(hsl.l - step);
      else return;
      e.preventDefault();
      setHsl(next);
      commit(next);
    },
    [hsl, commit]
  );

  const handleHueKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 15 : 3;
      let h = hsl.h;
      if (e.key === 'ArrowLeft') h = Math.max(0, hsl.h - step);
      else if (e.key === 'ArrowRight') h = Math.min(360, hsl.h + step);
      else return;
      e.preventDefault();
      const next = { ...hsl, h };
      setHsl(next);
      commit(next);
    },
    [hsl, commit]
  );

  if (!position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[110] p-2.5 flex flex-col gap-2 bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-md popover-enter"
      style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
      role="dialog"
      aria-label="Custom color"
      data-color-popover="true"
    >
      {/* Saturation across, lightness down, at the hue below */}
      <div
        className="relative h-[104px] rounded-[var(--radius-sm)] cursor-crosshair focus-ring touch-none"
        style={{
          background: `linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 50%, #000000 100%), linear-gradient(to right, #808080 0%, hsl(${hsl.h}, 100%, 50%) 100%)`,
        }}
        onPointerDown={handleFieldDown}
        onKeyDown={handleFieldKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and lightness"
        aria-valuetext={`${Math.round(hsl.s)}% saturation, ${Math.round(hsl.l)}% lightness`}
      >
        <span
          className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: `${hsl.s}%`,
            top: `${100 - hsl.l}%`,
            boxShadow: '0 0 0 1px rgba(23,23,26,0.35)',
            backgroundColor: color,
          }}
        />
      </div>

      {/* Hue */}
      <div
        className="relative h-3 rounded-[var(--radius-sm)] cursor-ew-resize focus-ring touch-none"
        style={{
          background:
            'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        }}
        onPointerDown={handleHueDown}
        onKeyDown={handleHueKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsl.h)}
      >
        <span
          className="absolute top-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white pointer-events-none"
          style={{
            left: `${(hsl.h / 360) * 100}%`,
            boxShadow: '0 0 0 1px rgba(23,23,26,0.35)',
            backgroundColor: `hsl(${hsl.h}, 100%, 50%)`,
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span
          className="w-6 h-6 shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-hairline)]"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <input
          value={hexDraft}
          onChange={handleHexChange}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          aria-label="Hex color"
          className="w-full min-w-0 px-2 py-1 text-meta font-mono uppercase bg-[var(--color-input-bg)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-[var(--radius-sm)] transition-colors duration-fast focus:outline-none focus:border-[var(--color-focus)]"
        />
      </div>
    </div>,
    document.body
  );
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
