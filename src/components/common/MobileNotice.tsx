import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Phones in portrait/landscape, plus small touch tablets
const MOBILE_MEDIA_QUERY =
  '(max-width: 767px), (pointer: coarse) and (max-width: 1023px)';
const DISMISSED_KEY = 'floid-mobile-notice-dismissed';

interface VisibleArea {
  readonly left: number;
  readonly width: number;
}

// The app's min content width exceeds phone widths, so mobile browsers expand
// the layout viewport beyond the visible area. Center the card in the visual
// viewport, not the layout viewport, so it isn't pushed off-screen.
function getVisibleArea(): VisibleArea {
  const vv = window.visualViewport;
  if (!vv) return { left: 0, width: window.innerWidth };
  return { left: vv.offsetLeft, width: vv.width };
}

export function MobileNotice(): JSX.Element | null {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches
  );
  const [isDismissed, setIsDismissed] = useState(
    () => sessionStorage.getItem(DISMISSED_KEY) === 'true'
  );
  const [visibleArea, setVisibleArea] = useState<VisibleArea>(getVisibleArea);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = (e: MediaQueryListEvent): void => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleViewportChange = (): void => setVisibleArea(getVisibleArea());
    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setIsDismissed(true);
  }, []);

  if (!isMobile || isDismissed) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-notice-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" aria-hidden="true" />

      {/* Centered within the visible area of the screen */}
      <div
        className="fixed top-0 h-full flex items-center justify-center"
        style={{ left: `${visibleArea.left}px`, width: `${visibleArea.width}px` }}
      >
        <div className="relative glass-bordered rounded-xl max-w-xs w-full mx-4 px-6 py-6 text-center modal-enter">
          {/* Monitor showing a mini FLOID timeline */}
          <svg
            className="mx-auto mb-4 text-[var(--color-logo-primary)]"
            width="96"
            height="72"
            viewBox="0 0 96 72"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="7"
              y="4"
              width="82"
              height="52"
              rx="7"
              stroke="currentColor"
              strokeWidth="3"
            />
            <rect x="16" y="15" width="28" height="7" rx="3.5" fill="var(--color-logo-bar-1)" />
            <rect x="28" y="26.5" width="38" height="7" rx="3.5" fill="var(--color-logo-bar-2)" />
            <rect x="44" y="38" width="30" height="7" rx="3.5" fill="var(--color-logo-bar-3)" />
            <circle cx="80" cy="41.5" r="3.5" fill="currentColor" />
            <line
              x1="48"
              y1="56"
              x2="48"
              y2="64"
              stroke="currentColor"
              strokeWidth="3"
            />
            <line
              x1="33"
              y1="66.5"
              x2="63"
              y2="66.5"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <h2
            id="mobile-notice-title"
            className="text-base font-semibold text-[var(--color-text-primary)] mb-1"
          >
            Best on a bigger screen
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            FLOID isn&apos;t designed for mobile. For the full experience, visit
            us on a full-sized computer screen:
          </p>
          <p className="mt-3 flex items-center justify-center gap-1.5">
            <span className="text-sm text-[var(--color-text-muted)]">https://</span>
            <span className="inline-block rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-sm font-semibold text-[var(--color-logo-primary)]">
              floid.design
            </span>
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            className="mt-4 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] underline btn-press focus-ring rounded"
          >
            Continue anyway,
            <br />
            but it ain&apos;t gonna be pretty
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
