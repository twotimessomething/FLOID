import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keyBelongsToGesture } from '../commands/gesture';
import { isImeComposing } from '../utils/keyboard';

/**
 * What every modal does with the pointer and the keyboard, written once.
 *
 * The backdrop dismisses a click that was pressed *and* released on it, and
 * nothing else. A text selection dragged out of the panel ends on the
 * backdrop, and so does the second click of the double-click whose first
 * click opened the panel — neither is someone asking for it to go.
 *
 * Focus goes in when the panel arrives, stays in while it is open (Tab wraps
 * at its edges), and goes back to whatever had it when the panel leaves.
 * Escape dismisses the topmost layer only, so a confirm raised over a modal
 * closes alone.
 */

interface LayerEntry {
  readonly isBlocking: boolean;
}

/** Open layers, oldest first: the last one is on top. */
const openLayers: LayerEntry[] = [];

/**
 * Whether a modal is covering the sheet. The sheet's own keys — arrows,
 * Return, Delete — have nothing under them to act on while one is.
 */
export function isBlockingModalOpen(): boolean {
  return openLayers.some((layer) => layer.isBlocking);
}

function isTopLayer(layer: LayerEntry): boolean {
  return openLayers[openLayers.length - 1] === layer;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
  '[contenteditable="true"]',
].join(',');

function tabStopsIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[hidden]')
  );
}

/**
 * Tab at the panel's last stop comes round to its first, and Shift+Tab the
 * other way. Focus that has strayed out — onto <body> after a focused control
 * went away, or still on the button that opened the panel — is brought back
 * in. Focus inside a popover the panel raised is that popover's business:
 * they portal to <body>, outside the panel, and carry a dialog role.
 */
function keepTabInside(e: KeyboardEvent, panel: HTMLElement): void {
  const active = document.activeElement;
  const isInside = active !== null && panel.contains(active);
  if (!isInside && active !== null && active !== document.body && active.closest('[role="dialog"]')) {
    return;
  }

  const stops = tabStopsIn(panel);
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) {
    e.preventDefault();
    panel.focus();
    return;
  }

  // From outside, from the panel itself, or off either end: Tab enters at
  // the first stop and Shift+Tab at the last
  const isAtEdge = active === (e.shiftKey ? first : last);
  if (isInside && active !== panel && !isAtEdge) return;
  e.preventDefault();
  (e.shiftKey ? last : first).focus();
}

/**
 * Hand focus back as the panel leaves — but only while the panel still has
 * it to give. Focus that has already moved on, into whatever replaced this
 * panel, stays where it went. With nowhere to return to, focus is let go
 * rather than left on a control in a panel that is fading out, where Return
 * would press it a second time.
 */
function restoreFocus(panelRef: React.RefObject<HTMLElement>, returnTo: Element | null): void {
  // Read at the close, not when the layer opened: the panel mounts a commit
  // after that
  const panel = panelRef.current;
  const active = document.activeElement;
  const isStillOurs =
    active === null || active === document.body || (panel !== null && panel.contains(active));
  if (!isStillOurs) return;

  if (returnTo instanceof HTMLElement && returnTo !== document.body && returnTo.isConnected) {
    returnTo.focus({ preventScroll: true });
  } else if (active instanceof HTMLElement && active !== document.body) {
    active.blur();
  }
}

interface ModalLayerOptions {
  /** True while the modal is open; false through its exit. */
  readonly isOpen: boolean;
  /** `usePresence`'s flag. Focus can only go into a panel that is there. */
  readonly isMounted: boolean;
  /** Escape, and a click pressed and released on the backdrop. */
  readonly onDismiss: () => void;
  /**
   * Whether the layer covers the sheet. The editor does not: it floats beside
   * the bar it edits, and the sheet's keys still drive the selection under it.
   */
  readonly isBlocking?: boolean;
}

interface BackdropProps {
  readonly onPointerDownCapture: (e: React.PointerEvent<HTMLElement>) => void;
  readonly onPointerUpCapture: (e: React.PointerEvent<HTMLElement>) => void;
  readonly onMouseDown: (e: React.MouseEvent<HTMLElement>) => void;
  readonly onClick: (e: React.MouseEvent<HTMLElement>) => void;
}

interface ModalLayer {
  /**
   * The panel: where focus goes in and where Tab keeps it. It takes
   * `tabIndex={-1}`, so it can hold focus itself when nothing inside asks
   * for it with `autoFocus` or `data-autofocus`.
   */
  readonly panelRef: React.RefObject<HTMLDivElement>;
  /**
   * For the full-screen layer behind the panel. Its scrim must let the
   * pointer through, so a press on the dimmed paper lands on the layer.
   */
  readonly backdropProps: BackdropProps;
}

export function useModalLayer({
  isOpen,
  isMounted,
  onDismiss,
  isBlocking = true,
}: ModalLayerOptions): ModalLayer {
  const panelRef = useRef<HTMLDivElement>(null);
  const [layer] = useState<LayerEntry>(() => ({ isBlocking }));
  // A modal that loads lazily can mount already open, and an autoFocus child
  // takes focus in that first commit, before any effect could ask who had it.
  // Rendering comes first, so the question is asked here.
  const [focusAtMount] = useState(() => (isOpen ? document.activeElement : null));
  const returnFocusRef = useRef<Element | null>(null);
  const pressedBackdropRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    openLayers.push(layer);
    // Only a press made after the panel opened can dismiss it
    pressedBackdropRef.current = false;
    const active = document.activeElement;
    const opener = active !== null && panelRef.current?.contains(active) ? focusAtMount : active;
    returnFocusRef.current = opener ?? document.body;

    return () => {
      const index = openLayers.indexOf(layer);
      if (index !== -1) openLayers.splice(index, 1);
    };
  }, [isOpen, layer, focusAtMount]);

  // On the close itself, not in the cleanup above: StrictMode runs that
  // cleanup straight after a modal mounts open, and handing focus back there
  // would pull it off an autoFocus field that never gets it again
  useEffect(() => {
    if (isOpen || !returnFocusRef.current) return;
    restoreFocus(panelRef, returnFocusRef.current);
    returnFocusRef.current = null;
  }, [isOpen]);

  // After the panel is in the DOM, not when the flag flips: `usePresence`
  // mounts it a commit later, and focusing a node that is not there yet
  // silently does nothing.
  useEffect(() => {
    if (!isOpen || !isMounted) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    const target = panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel;
    target.focus({ preventScroll: true });
    if (target instanceof HTMLInputElement) target.select();
  }, [isOpen, isMounted]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isTopLayer(layer)) return;
      if (e.key === 'Escape') {
        // Mid-composition Escape drops the candidate; mid-drag, the drag; and
        // one a menu over the layer already answered closes only the menu
        if (e.defaultPrevented || isImeComposing(e) || keyBelongsToGesture(e)) return;
        onDismiss();
      } else if (e.key === 'Tab' && panelRef.current) {
        keepTabInside(e, panelRef.current);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, layer, onDismiss]);

  // Capture phase, so a control that stops its own press cannot leave a stale
  // answer behind
  const handlePointerDownCapture = useCallback((e: React.PointerEvent<HTMLElement>): void => {
    pressedBackdropRef.current = e.target === e.currentTarget;
  }, []);

  const handlePointerUpCapture = useCallback((e: React.PointerEvent<HTMLElement>): void => {
    if (e.target !== e.currentTarget) pressedBackdropRef.current = false;
  }, []);

  // Pressing the backdrop is not choosing it: focus stays in the panel
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLElement>): void => {
    if (e.target === e.currentTarget) e.preventDefault();
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>): void => {
      const pressedBackdrop = pressedBackdropRef.current;
      pressedBackdropRef.current = false;
      // A press and a release on two different things arrive here as one
      // click on the layer, their common ancestor — hence the press check.
      // A second click (detail 2) is still the double-click it belongs to,
      // wherever it lands: here, on the backdrop the first click put over
      // the bar.
      if (pressedBackdrop && e.target === e.currentTarget && e.detail <= 1) onDismiss();
    },
    [onDismiss]
  );

  const backdropProps = useMemo(
    (): BackdropProps => ({
      onPointerDownCapture: handlePointerDownCapture,
      onPointerUpCapture: handlePointerUpCapture,
      onMouseDown: handleMouseDown,
      onClick: handleClick,
    }),
    [handlePointerDownCapture, handlePointerUpCapture, handleMouseDown, handleClick]
  );

  return { panelRef, backdropProps };
}
