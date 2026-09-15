import { useEffect, useState, type RefObject } from 'react';

/**
 * The element's width in px, kept current.
 *
 * The walkthrough's gestures work in pixels for the same reason the timeline's
 * do — a pointer arrives in pixels and a ghost is written in pixels — so the
 * one number every lesson needs is how wide its paper is. Zero until the first
 * measurement, which is the frame before anything is drawn on it.
 *
 * The observer is created inside the effect rather than against a captured
 * `ref.current`: timeline refs are null on the first render, so a dependency
 * list holding `ref.current` would never re-run and never bind.
 */
export function useMeasuredWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === 'number') setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
