import { useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { usePresence } from '../../hooks/usePresence';
import { markReleasesSeen } from '../../hooks/useWhatsNew';
import { fromDayKey } from '../../utils/dayKeys';
import { PHASE_COLORS } from '../../constants/colors';
import { Button } from '../common/Button';

/**
 * Each bullet takes the next ink, so a release reads as a short run of the
 * palette rather than a list of dashes. Mid-tones only: `MULTICOLOR_SEQUENCE`
 * alternates value deliberately, and its tints are sized to hold a label on a
 * bar — at 6px on white paper sky and mint all but disappear. These six carry
 * on both grounds.
 */
const DOT_INKS: readonly string[] = [
  PHASE_COLORS.teal,
  PHASE_COLORS.red,
  PHASE_COLORS.ochre,
  PHASE_COLORS.blue,
  PHASE_COLORS.moss,
  PHASE_COLORS.orange,
];

function dotColor(index: number): string {
  return DOT_INKS[index % DOT_INKS.length];
}

/**
 * What shipped, on one sheet of floating paper.
 *
 * Every way out is the same way out — the button, Escape, the backdrop — and
 * all of them mark the reader caught up. A panel that only counted as read if
 * you pressed the right button would come back tomorrow having already said
 * its piece.
 */
export function WhatsNewModal(): JSX.Element | null {
  const isWhatsNewOpen = useUIStore((state) => state.isWhatsNewOpen);
  const releases = useUIStore((state) => state.whatsNewReleases);
  const closeWhatsNew = useUIStore((state) => state.closeWhatsNew);

  const handleDismiss = useCallback(() => {
    closeWhatsNew();
    void markReleasesSeen();
  }, [closeWhatsNew]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleDismiss();
      }
    },
    [handleDismiss]
  );

  useEffect(() => {
    if (!isWhatsNewOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isWhatsNewOpen, handleDismiss]);

  // Where each release's colour run picks up, so the walk continues across a
  // panel showing several rather than restarting on every heading.
  const colorOffsets = useMemo(() => {
    let running = 0;
    return releases.map((release) => {
      const offset = running;
      running += release.notes.length;
      return offset;
    });
  }, [releases]);

  // Held on screen through the exit so the panel and its scrim leave together.
  const { isMounted, isLeaving } = usePresence(isWhatsNewOpen);
  if (!isMounted || releases.length === 0) return null;

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/25" />

      {/* Panel */}
      <div
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-sm mx-4 modal-enter"
        role="document"
      >
        <div className="px-6 pt-5 pb-1">
          <h2 className="text-title font-medium text-[var(--color-text-primary)]" id="whats-new-title">
            What&rsquo;s new
          </h2>
          <p className="eyebrow mt-1">
            {/* One release needs no version heading of its own — the date
                belongs up here with the title, where it dates the whole panel. */}
            {releases.length === 1
              ? format(fromDayKey(releases[0].date), 'd MMMM yyyy')
              : `${releases.length} releases`}
          </p>
        </div>

        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-6">
          {releases.map((release, releaseIndex) => (
            <div key={release.version}>
              {releases.length > 1 && (
                <h3 className="eyebrow mb-2.5">
                  {release.version} · {format(fromDayKey(release.date), 'd MMM yyyy')}
                </h3>
              )}
              <ul className="space-y-3">
                {release.notes.map((note, noteIndex) => (
                  <li
                    key={note}
                    className="flex gap-3 text-body text-[var(--color-text-secondary)] leading-relaxed"
                  >
                    <span
                      className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: dotColor(colorOffsets[releaseIndex] + noteIndex) }}
                      aria-hidden="true"
                    />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex justify-end px-6 pb-5 pt-1">
          <Button variant="primary" onClick={handleDismiss} autoFocus>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
