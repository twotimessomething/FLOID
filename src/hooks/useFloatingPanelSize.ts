import { useLayoutEffect, useState, type RefObject } from 'react';

interface FloatingPanelSize {
  /** The panel's rendered height in px; 0 until it is first measured. */
  readonly height: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

/**
 * What a floating panel needs to keep itself inside the window: its own
 * height, which changes as the editor inside it does, and the window's.
 *
 * Measured in a layout effect, so the first frame on screen is already placed
 * from the real height. `isMounted` re-binds the observer when the panel comes
 * back: its ref is null while it is away.
 */
export function useFloatingPanelSize(
  ref: RefObject<HTMLElement>,
  isMounted: boolean
): FloatingPanelSize {
  const [height, setHeight] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useLayoutEffect(() => {
    const node = ref.current;
    if (!isMounted || !node) return;
    setHeight(node.offsetHeight);
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, isMounted]);

  useLayoutEffect(() => {
    if (!isMounted) return;
    const handleResize = (): void =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMounted]);

  return { height, viewportWidth: viewport.width, viewportHeight: viewport.height };
}
