import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { CreateReadoutHandle } from '../../hooks/useCreateGhost';
import type { DrawnSpanReadout } from '../../utils/creationUtils';

/**
 * Roughly how wide a piece of the readout will be. Measuring the real thing
 * would mean reading layout back on a frame that has just written to it, sixty
 * times a second, to decide something a few pixels of slack settle just as
 * well: at 11px tabular type a character is about six pixels, and a chip adds
 * its padding.
 */
const CHAR_PX = 6;
const CHIP_PADDING_PX = 14;
const textWidth = (text: string): number => text.length * CHAR_PX;
const chipWidth = (text: string): number => textWidth(text) + CHIP_PADDING_PX;

/** Clear air kept between the two date chips before they merge into one. */
const CHIP_GAP_PX = 10;
/** Clear air kept between the length and the span's own two edges. */
const COUNT_MARGIN_PX = 12;

/** Writes only when the words actually changed. A draw repaints constantly. */
function write(node: HTMLElement | null, text: string): void {
  if (node && node.textContent !== text) node.textContent = text;
}

/**
 * What a span being drawn says about itself: the day it starts on, the day it
 * ends on, and how long it is.
 *
 * Each date stands over the end it belongs to and points down at it — the same
 * bubble a resize hangs off the edge it is moving, so a day under the cursor
 * looks the same wherever the cursor is. The length sits inside the sketch, the
 * way a bar carries its own name.
 *
 * Centred on their own edges, the two chips would meet on a short span. Rather
 * than let them collide, a span too narrow to hold the readout spread out says
 * the whole thing at once, in a single chip over the middle.
 *
 * It all lives inside the ghost, so it costs the gesture nothing to carry — the
 * chips hang off the ghost's own two edges and the draw moves them by moving
 * the ghost. Only the words are ever written, and they are written through the
 * ref rather than through props: a draw reports sixty times a second and none
 * of those frames should re-render a row.
 */
export const GhostSpanReadout = forwardRef<CreateReadoutHandle>(function GhostSpanReadout(
  _props,
  ref
) {
  const startRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLSpanElement>(null);
  const durationRef = useRef<HTMLSpanElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      show: ({ start, end, duration }: DrawnSpanReadout, width: number): void => {
        // Two chips centred on the two edges overlap once the span is narrower
        // than their inner halves; the length needs the whole span to itself.
        const isTight =
          width < (chipWidth(start) + chipWidth(end)) / 2 + CHIP_GAP_PX ||
          width < textWidth(duration) + COUNT_MARGIN_PX;
        // Whichever pieces this width cannot carry are emptied, and an empty
        // one takes up no room — which is also what keeps the first frame of a
        // draw, before any of this has been said, from showing empty chips.
        write(startRef.current, isTight ? '' : start);
        write(endRef.current, isTight ? '' : end);
        write(durationRef.current, isTight ? '' : duration);
        write(rangeRef.current, isTight ? `${start} – ${end} · ${duration}` : '');
      },
    }),
    []
  );

  return (
    <div className="ghost-readout" aria-hidden="true">
      <span ref={startRef} className="ghost-readout__chip ghost-readout__chip--start" />
      <span ref={endRef} className="ghost-readout__chip ghost-readout__chip--end" />
      <span ref={rangeRef} className="ghost-readout__chip ghost-readout__chip--range" />
      <span ref={durationRef} className="ghost-readout__duration" />
    </div>
  );
});
