export interface FloatingPanelPlacement {
  readonly left: number;
  readonly top: number;
  /** The tallest the panel may be: the window, less a margin at each edge. */
  readonly maxHeight: number;
}

interface PlacementInput {
  /** Where the panel was asked to open — its top-left corner, ideally. */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly width: number;
  /** The panel's rendered height; 0 before it has been measured. */
  readonly height: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly padding: number;
  /** Gap left between the anchor and a panel flipped to its left. */
  readonly flipGap: number;
}

/**
 * Put a floating panel at its anchor, kept inside the window.
 *
 * The panel is as tall as its contents up to the whole window, and moves up
 * rather than shrinking when it would run off the bottom — a tall window
 * should show the whole editor, not an inner scroll. It flips to the anchor's
 * left when there is no room on the right.
 */
export function placeFloatingPanel({
  anchorX,
  anchorY,
  width,
  height,
  viewportWidth,
  viewportHeight,
  padding,
  flipGap,
}: PlacementInput): FloatingPanelPlacement {
  const maxHeight = Math.max(0, viewportHeight - padding * 2);
  const shown = Math.min(height, maxHeight);

  let left = anchorX;
  if (left + width + padding > viewportWidth) left = anchorX - width - flipGap;

  let top = anchorY;
  if (top + shown + padding > viewportHeight) top = viewportHeight - shown - padding;

  return {
    left: Math.max(padding, left),
    top: Math.max(padding, top),
    maxHeight,
  };
}
