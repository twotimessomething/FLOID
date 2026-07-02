/**
 * Collision-aware layout for milestone labels along a horizontal axis.
 *
 * Greedy left-to-right sweep: each label sits centered under its anchor,
 * nudged right by the minimum needed to clear the previous label. Nudges
 * are capped so the anchor diamond always stays visually under the label;
 * a label that would need more than the cap is hidden instead (its diamond
 * remains and the label reveals on hover).
 */

export interface LabelPlacement {
  readonly isHidden: boolean;
  /** Horizontal shift in px from centered-under-anchor. 0 when hidden. */
  readonly offsetX: number;
}

export interface LabelCandidate {
  readonly id: string;
  /** Anchor x position in px (the milestone diamond center). */
  readonly center: number;
  /** Rendered label width in px. */
  readonly width: number;
}

/** Minimum horizontal space between adjacent labels. */
const LABEL_GAP = 6;
/** Beyond this shift a label no longer reads as attached to its diamond. */
const MAX_LABEL_NUDGE = 20;
/** Keep the diamond at least this far inside the label's edge when nudging. */
const MIN_ANCHOR_INSET = 8;

const HIDDEN: LabelPlacement = { isHidden: true, offsetX: 0 };

export function layoutLabels(
  candidates: readonly LabelCandidate[]
): ReadonlyMap<string, LabelPlacement> {
  const sorted = [...candidates].sort((a, b) => a.center - b.center);
  const placements = new Map<string, LabelPlacement>();
  let lastRight = Number.NEGATIVE_INFINITY;

  for (const { id, center, width } of sorted) {
    const centeredLeft = center - width / 2;
    const left = Math.max(centeredLeft, lastRight + LABEL_GAP);
    const offsetX = left - centeredLeft;
    const maxOffset = Math.min(MAX_LABEL_NUDGE, Math.max(0, width / 2 - MIN_ANCHOR_INSET));

    if (offsetX <= maxOffset) {
      placements.set(id, { isHidden: false, offsetX });
      lastRight = left + width;
    } else {
      placements.set(id, HIDDEN);
    }
  }

  return placements;
}

// Label pill horizontal chrome: px-2 (16px) plus a 1px border on each side.
const LABEL_H_CHROME = 18;
// Tailwind text-xs.
const LABEL_FONT_SIZE = 12;
// Rough per-character width when canvas text metrics are unavailable.
const FALLBACK_CHAR_WIDTH = 7;

let measureContext: CanvasRenderingContext2D | null | undefined;
const labelWidthCache = new Map<string, number>();

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext === undefined) {
    measureContext =
      typeof document === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d');
    if (measureContext) {
      const fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
      measureContext.font = `${LABEL_FONT_SIZE}px ${fontFamily}`;
    }
  }
  return measureContext;
}

/** Pixel width of a milestone label pill as rendered by MilestoneLabel. */
export function measureMilestoneLabelWidth(text: string): number {
  const cached = labelWidthCache.get(text);
  if (cached !== undefined) return cached;

  const context = getMeasureContext();
  const textWidth = context
    ? context.measureText(text).width
    : text.length * FALLBACK_CHAR_WIDTH;
  const width = textWidth + LABEL_H_CHROME;
  labelWidthCache.set(text, width);
  return width;
}
