/**
 * A name its column cut short says itself in full on hover; one that fits
 * says nothing twice. Read on the way in, so it costs one layout read per
 * hover rather than a measurement on every render.
 */
export function titleIfTruncated(e: React.PointerEvent<HTMLElement>): void {
  const element = e.currentTarget;
  if (element.scrollWidth > element.clientWidth) {
    element.title = element.textContent ?? '';
  } else {
    element.removeAttribute('title');
  }
}
