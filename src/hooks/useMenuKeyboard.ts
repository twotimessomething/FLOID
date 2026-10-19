import { useCallback, useEffect, type RefObject } from 'react';
import { isImeComposing } from '../utils/keyboard';

/**
 * Where ↑ and ↓ stop: each row, and a group (a strip of swatches) as one stop.
 * Disabled rows are passed over; a disabled button cannot take focus anyway.
 */
const STOP_SELECTOR = '[data-menu-stop]:not(:disabled)';
/** One of a group's members, which ← and → walk between. */
const MEMBER_SELECTOR = '[data-menu-member]';
/** The member a group is entered on — the one that is chosen now. */
const CURRENT_MEMBER_SELECTOR = '[data-menu-member][data-current]';

/**
 * Keys an open menu keeps from the sheet behind it. Left to go by, ↓ would
 * walk the selection under the menu and Return would open the editor there.
 */
const HELD_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Enter',
  ' ',
  'Tab',
  'Delete',
  'Backspace',
]);

/** The element a stop puts the keyboard on: a row itself, a group's current member. */
function focusStop(stop: HTMLElement | undefined): void {
  if (!stop) return;
  const target = stop.matches(MEMBER_SELECTOR)
    ? stop
    : (stop.querySelector<HTMLElement>(CURRENT_MEMBER_SELECTOR) ??
      stop.querySelector<HTMLElement>(MEMBER_SELECTOR) ??
      stop);
  target.focus({ preventScroll: true });
}

/** Within reach of `from`, clamped: a native menu does not wrap. */
function stepIndex(from: number, delta: number, count: number): number {
  if (from < 0) return delta > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, from + delta));
}

/**
 * The next row after `from` whose label starts with `letter`, coming round to
 * the top — so pressing the same letter again walks every row that shares it.
 */
function typeaheadIndex(stops: readonly HTMLElement[], from: number, letter: string): number {
  const wanted = letter.toLocaleLowerCase();
  for (let step = 1; step <= stops.length; step++) {
    const index = (Math.max(from, -1) + step) % stops.length;
    const label = stops[index].textContent?.trim().toLocaleLowerCase() ?? '';
    if (label.startsWith(wanted)) return index;
  }
  return -1;
}

function moveFocus(menu: HTMLElement, key: string): void {
  const active = document.activeElement;
  const stops = Array.from(menu.querySelectorAll<HTMLElement>(STOP_SELECTOR));
  if (stops.length === 0) return;
  const current = stops.findIndex((stop) => stop.contains(active));

  switch (key) {
    case 'ArrowDown':
      focusStop(stops[stepIndex(current, 1, stops.length)]);
      return;
    case 'ArrowUp':
      focusStop(stops[stepIndex(current, -1, stops.length)]);
      return;
    case 'Home':
      focusStop(stops[0]);
      return;
    case 'End':
      focusStop(stops[stops.length - 1]);
      return;
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (!(active instanceof HTMLElement) || !active.matches(MEMBER_SELECTOR)) return;
      const members = Array.from(
        stops[current]?.querySelectorAll<HTMLElement>(MEMBER_SELECTOR) ?? []
      );
      const index = members.indexOf(active);
      focusStop(members[stepIndex(index, key === 'ArrowRight' ? 1 : -1, members.length)]);
      return;
    }
    default: {
      // Held keys that do nothing here — Tab, Delete — are not letters to seek
      if (key.length !== 1 || key === ' ') return;
      const index = typeaheadIndex(stops, current, key);
      if (index >= 0) focusStop(stops[index]);
    }
  }
}

/**
 * The keyboard and the highlight of a menu, the way a native one has them.
 *
 * The menu takes focus when it opens, with nothing highlighted; ↓ and ↑ walk
 * the enabled rows (from nothing, ↓ lands on the first and ↑ on the last),
 * Home and End jump to the ends, ← and → walk a strip of swatches, and a
 * letter jumps to the next row it starts. Return and Space press whatever is
 * highlighted — the button's own activation, so a row that toggles something
 * toggles once. Escape belongs to `useMenuDismissal`.
 *
 * Listening on the window in the capture phase puts the menu ahead of every
 * other key handler, so the keys it holds never reach the sheet. Modified
 * combos go on by — ⌘Z is the app's, not the menu's — and so does anything
 * aimed at a surface in `ownedSelector`, a popover with fields of its own.
 *
 * The highlight is focus, and the pointer moves it: hovering a row focuses
 * it, leaving the rows hands focus back to the menu. So the mouse and the
 * keyboard share one highlight rather than drawing two at once, and ↓ after
 * hovering carries on from the row under the pointer.
 */
export function useMenuKeyboard(
  menuRef: RefObject<HTMLElement>,
  isOpen: boolean,
  ownedSelector?: string
): {
  readonly handlePointerMove: (e: React.PointerEvent) => void;
  readonly handlePointerLeave: () => void;
} {
  useEffect(() => {
    if (!isOpen) return;
    menuRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (e: KeyboardEvent): void => {
      const menu = menuRef.current;
      if (!menu || e.key === 'Escape') return;
      if (e.metaKey || e.ctrlKey || e.altKey || isImeComposing(e)) return;
      if (
        ownedSelector &&
        e.target instanceof Element &&
        e.target.closest(ownedSelector) !== null
      ) {
        return;
      }

      const isLetter = e.key.length === 1 && e.key !== ' ';
      if (!HELD_KEYS.has(e.key) && !isLetter) return;
      e.stopPropagation();

      const active = document.activeElement;
      const hasHighlight =
        active instanceof HTMLElement && active !== menu && menu.contains(active);
      // A highlighted button presses itself: Return on keydown, Space on keyup
      if ((e.key === 'Enter' || e.key === ' ') && hasHighlight) return;
      e.preventDefault();
      moveFocus(menu, e.key);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, menuRef, ownedSelector]);

  /** Whether focus is in a surface of the menu's own that the pointer must not take it from. */
  const isFocusOwnedElsewhere = useCallback((): boolean => {
    const active = document.activeElement;
    return Boolean(ownedSelector && active instanceof Element && active.closest(ownedSelector));
  }, [ownedSelector]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent): void => {
      const menu = menuRef.current;
      if (!menu || e.pointerType === 'touch' || isFocusOwnedElsewhere()) return;
      const target = e.target instanceof Element ? e.target : null;
      const entry = target?.closest<HTMLElement>(`${STOP_SELECTOR}, ${MEMBER_SELECTOR}`);
      // A group's padding, a separator, a disabled row: nothing is highlighted
      const next = entry && !entry.matches('[role="group"]') ? entry : menu;
      if (document.activeElement !== next) next.focus({ preventScroll: true });
    },
    [menuRef, isFocusOwnedElsewhere]
  );

  const handlePointerLeave = useCallback((): void => {
    const menu = menuRef.current;
    if (!menu || isFocusOwnedElsewhere() || !menu.contains(document.activeElement)) return;
    menu.focus({ preventScroll: true });
  }, [menuRef, isFocusOwnedElsewhere]);

  return { handlePointerMove, handlePointerLeave };
}
