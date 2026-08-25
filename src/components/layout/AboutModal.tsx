import { useCallback, useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { usePresence } from '../../hooks/usePresence';
import { isDesktop } from '../../platform/detect';

const CONTACT_EMAIL = 'support@floid.design';
const SOURCE_URL = 'https://github.com/twotimessomething/FLOID';

type AboutTab = 'about' | 'privacy';

const TABS: readonly { readonly value: AboutTab; readonly label: string }[] = [
  { value: 'about', label: 'About' },
  { value: 'privacy', label: 'Privacy' },
];

/**
 * Both tabs live in the panel rather than at a route of their own. FLOID is
 * one sheet of paper — sending someone to a second page to read three
 * paragraphs would be the only navigation in the whole app.
 *
 * The two targets make genuinely different promises, and the Mac one is the
 * stronger claim: the App Store build ships without the network entitlement,
 * so it cannot transmit anything even in principle. Repeating the web wording
 * there would be false — `WebAnalytics` never mounts behind `isDesktop()` and
 * every typeface is bundled — and it would contradict the “collects no data”
 * answer on the store listing, which is the kind of contradiction App Review
 * escalates rather than waves through.
 */
const COPY = {
  web: {
    summary:
      'A timeline tool for planning product development. Free, no account, and no server — the whole app runs in this browser tab.',
    storage:
      'Everything you make stays on this device, in your browser’s own storage. FLOID has no backend and no account system, so there is nowhere for a project to be uploaded to. Clearing this site’s data deletes your work — export a backup to keep it.',
    transmissionTitle: 'What leaves your browser',
    transmission:
      'Only two things: the page itself, and anonymous page-view analytics. No project names, dates, or contents are ever transmitted. Typefaces are served from floid.design itself, not from a font network.',
    exports:
      'Files are written by your browser and saved where you choose. Nothing is uploaded, and imports are read locally the same way.',
  },
  desktop: {
    summary:
      'A timeline tool for planning product development. Free, no account, and no server — the whole app runs on this Mac.',
    storage:
      'Everything you make stays on this Mac, in this app’s own storage. FLOID has no backend and no account system, so there is nowhere for a project to be uploaded to. Deleting the app deletes your work — export a backup to keep it.',
    transmissionTitle: 'What leaves this Mac',
    transmission:
      'Nothing. FLOID ships without the network entitlement, so it cannot make a network request at all — no analytics, no crash reports, no update checks. Every typeface and template is inside the app.',
    exports:
      'Files are written where you point the save panel, and nowhere else. Nothing is uploaded, and imports are read locally the same way.',
  },
} as const;


function MailIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function GitHubIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

interface ExternalRowProps {
  readonly href: string;
  readonly label: string;
  readonly isExternal?: boolean;
  readonly children: React.ReactNode;
}

function LinkRow({ href, label, isExternal, children }: ExternalRowProps): JSX.Element {
  return (
    <a
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-center gap-2 py-1.5 text-body text-[var(--color-focus)] hover:underline focus-ring rounded-[var(--radius-sm)]"
    >
      {children}
      {label}
    </a>
  );
}

interface PrivacySectionProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

function PrivacySection({ title, children }: PrivacySectionProps): JSX.Element {
  return (
    <div>
      <h3 className="eyebrow mb-1.5">{title}</h3>
      <p className="text-body text-[var(--color-text-secondary)] leading-relaxed">{children}</p>
    </div>
  );
}

export function AboutModal(): JSX.Element | null {
  const isAboutModalOpen = useUIStore((state) => state.isAboutModalOpen);
  const closeAboutModal = useUIStore((state) => state.closeAboutModal);
  const [tab, setTab] = useState<AboutTab>('about');
  const copy = isDesktop() ? COPY.desktop : COPY.web;

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeAboutModal();
      }
    },
    [closeAboutModal]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeAboutModal();
      }
    };

    if (isAboutModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isAboutModalOpen, closeAboutModal]);

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(isAboutModalOpen);
  if (!isMounted) return null;

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/25" />

      {/* Modal */}
      <div
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-sm mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-title font-medium text-[var(--color-text-primary)]" id="about-title">
            FLOID
          </h2>
          <button
            onClick={closeAboutModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--color-hover)] focus-ring btn-press"
            aria-label="Close (Escape)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5">
          <div className="flex gap-1 p-1 bg-[var(--color-background)] rounded-[var(--radius-md)]" role="tablist">
            {TABS.map((option) => (
              <button
                key={option.value}
                onClick={() => setTab(option.value)}
                role="tab"
                aria-selected={tab === option.value}
                aria-controls={`about-panel-${option.value}`}
                id={`about-tab-${option.value}`}
                className={`flex-1 flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] btn-press focus-ring ${
                  tab === option.value
                    ? 'bg-[var(--color-raised)] text-[var(--color-text-primary)] border border-[var(--color-border)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {tab === 'about' ? (
            <div
              role="tabpanel"
              id="about-panel-about"
              aria-labelledby="about-tab-about"
              className="space-y-4"
            >
              <p className="text-body text-[var(--color-text-secondary)] leading-relaxed">
                {copy.summary}
              </p>

              <div>
                <h3 className="eyebrow mb-1">Get in touch</h3>
                <LinkRow href={`mailto:${CONTACT_EMAIL}`} label={CONTACT_EMAIL}>
                  <MailIcon />
                </LinkRow>
                <LinkRow href={SOURCE_URL} label="Source on GitHub" isExternal>
                  <GitHubIcon />
                </LinkRow>
              </div>

              <p className="text-meta text-[var(--color-text-muted)]">
                Bug reports, feature requests and questions all go to the same inbox.
              </p>
            </div>
          ) : (
            <div
              role="tabpanel"
              id="about-panel-privacy"
              aria-labelledby="about-tab-privacy"
              className="space-y-4"
            >
              <PrivacySection title="Your projects">{copy.storage}</PrivacySection>

              <PrivacySection title={copy.transmissionTitle}>{copy.transmission}</PrivacySection>

              <PrivacySection title="Exports">{copy.exports}</PrivacySection>

              <PrivacySection title="Questions">
                Write to{' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-[var(--color-focus)] hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
                .
              </PrivacySection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
