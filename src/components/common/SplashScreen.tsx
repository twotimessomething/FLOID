import { useEffect, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';

/**
 * The door.
 *
 * The mark draws itself once, holds, and fades off to reveal a timeline that
 * is already finished — nothing here is a progress indicator, and nothing
 * underneath it is still being assembled by the time the fade starts.
 *
 * It is mounted beside `<App />` rather than inside it because App swaps its
 * whole tree for a "Loading…" line until storage has opened. Covering that gap
 * is the entire job, and it cannot be done from inside the branch being
 * covered.
 */

/** The staggered bar wipes, start of the first to end of the last. */
const DRAW_MS = 340;
/** How long the finished mark stays put. */
const HOLD_MS = 300;
/** The overlay's own fade — keep in step with `--duration-slow`. */
const FADE_MS = 200;
/**
 * A ceiling on waiting for storage. This overlay covers the app, so a boot
 * that never reports ready must not be able to leave it sitting there.
 */
const MAX_WAIT_MS = 2000;

export function SplashScreen(): JSX.Element | null {
  const isStorageReady = useProjectStore((state) => state.isStorageReady);
  const [hasShown, setHasShown] = useState(false);
  const [hasWaited, setHasWaited] = useState(false);
  const [isGone, setIsGone] = useState(false);

  useEffect(() => {
    const shown = window.setTimeout(() => setHasShown(true), DRAW_MS + HOLD_MS);
    const waited = window.setTimeout(() => setHasWaited(true), MAX_WAIT_MS);
    return () => {
      window.clearTimeout(shown);
      window.clearTimeout(waited);
    };
  }, []);

  // It leaves on the later of the two: the animation having played, and the app
  // behind it being worth revealing.
  const isLeaving = hasShown && (isStorageReady || hasWaited);

  useEffect(() => {
    if (!isLeaving) return;
    const timer = window.setTimeout(() => setIsGone(true), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [isLeaving]);

  if (isGone) return null;

  return (
    <div className={isLeaving ? 'splash splash--leaving' : 'splash'} aria-hidden="true">
      {/* The mark, inline rather than fetched: a splash that waits on a network
          round trip is not a splash. Colours are lifted from
          `public/FLOID_logo.svg` — the mark itself is identical in both themes,
          which is why none of them are tokens. Bars are ordered top to bottom
          so the wipe stagger below reads as one sweep down the chart. */}
      <svg className="splash__mark" viewBox="0 0 296.49 296.49" focusable="false">
        <circle cx="148.24" cy="148.24" r="148.24" fill="#3a3f76" />
        <g className="splash__bars">
          <polygon
            className="splash__bar"
            fill="#5bb5a9"
            points="215.41 100.52 82.08 100.52 82.08 67.4 224.4 67.4 215.41 100.52"
          />
          <rect className="splash__bar" fill="#b1e3f9" x="82.08" y="110.25" width="57.69" height="33.12" />
          <rect className="splash__bar" fill="#ea733e" x="82.08" y="153.11" width="36.23" height="33.12" />
          <polygon
            className="splash__bar"
            fill="#ea733e"
            points="197.37 186.23 128.15 186.23 128.15 153.11 206.36 153.11 197.37 186.23"
          />
          <polygon
            className="splash__bar"
            fill="#f1b5d4"
            points="116.58 229.09 82.08 229.09 82.08 195.96 125.57 195.96 116.58 229.09"
          />
        </g>
      </svg>
    </div>
  );
}
