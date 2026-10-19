import { useLayoutEffect, useRef, type RefObject } from 'react';
import { keyBelongsToGesture } from '../commands/gesture';
import { isImeComposing } from '../utils/keyboard';

/**
 * Every way a menu goes away without being answered, the way a native one does.
 *
 * A press outside it, Escape, the sheet scrolling under it, the window being
 * resized, the app losing focus. A menu left floating after any of these is
 * pointing at something that is no longer under it — scroll the sheet and it
 * hangs over a different bar; ⌘-Tab away and back and it is still waiting.
 *
 * `insideSelector` names surfaces that belong to the menu without living in
 * it, like a popover it portals out. Focus goes back where it was when the
 * menu opened, but only if nothing else has claimed it since — an editor the
 * menu opened keeps the field it focused.
 *
 * A layout effect, so the focus to return to is read before any effect of
 * the menu's own — `useMenuKeyboard` included — has moved it into the menu.
 * `onDismiss` is read through a ref: a new callback must not tear the
 * listeners down mid-menu, because tearing down is what hands focus back.
 */
export function useMenuDismissal(
  isOpen: boolean,
  onDismiss: () => void,
  containerRef: RefObject<HTMLElement>,
  insideSelector?: string
): void {
  const onDismissRef = useRef(onDismiss);
  useLayoutEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useLayoutEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    const returnFocusTo = document.activeElement;
    const dismiss = (): void => onDismissRef.current();

    const isInside = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      if (containerRef.current?.contains(target)) return true;
      return (
        insideSelector !== undefined &&
        target instanceof Element &&
        target.closest(insideSelector) !== null
      );
    };

    const handlePointerDown = (e: PointerEvent): void => {
      if (!isInside(e.target)) dismiss();
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      // An Escape that called a drag off, or dropped a candidate, is spent
      if (e.key !== 'Escape' || isImeComposing(e) || keyBelongsToGesture(e)) return;
      // A surface the menu raised sits above it and takes its Escape first —
      // the colour popover closes, and the menu stays where it was
      if (insideSelector !== undefined && document.querySelector(insideSelector) !== null) return;
      // Answered: whatever listens after this leaves the press alone
      e.preventDefault();
      dismiss();
    };
    // A wheel over the menu moves nothing behind it
    const handleWheel = (e: WheelEvent): void => {
      if (!isInside(e.target)) dismiss();
    };

    // Deferred so the press that opened the menu does not close it again
    const timeoutId = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown);
    }, 0);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('wheel', handleWheel, { capture: true, passive: true });
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('wheel', handleWheel, { capture: true });
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);

      const active = document.activeElement;
      const isFocusLost =
        active === null || active === document.body || (container?.contains(active) ?? false);
      if (
        isFocusLost &&
        returnFocusTo instanceof HTMLElement &&
        returnFocusTo !== document.body &&
        returnFocusTo.isConnected
      ) {
        returnFocusTo.focus({ preventScroll: true });
      }
    };
  }, [isOpen, containerRef, insideSelector]);
}
