import { useCallback, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';

interface Shortcut {
  keys: string[];
  description: string;
  combo?: boolean; // true = keys joined with "+", false/undefined = alternatives
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Drag Modifiers',
    shortcuts: [
      { keys: ['Shift'], description: 'Preserve children positions while dragging' },
      { keys: ['Shift', '⌘'], description: 'Ripple siblings when resizing end', combo: true },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['↑', '↓'], description: 'Select previous / next item' },
      { keys: ['Esc'], description: 'Clear selection / Close sidebar' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['Enter', 'Space'], description: 'Expand / Collapse section or phase' },
      { keys: ['Delete', '⌫'], description: 'Delete selected item' },
    ],
  },
  {
    title: 'History',
    shortcuts: [
      { keys: ['⌘', 'Z'], description: 'Undo', combo: true },
      { keys: ['⌘', 'Shift', 'Z'], description: 'Redo', combo: true },
    ],
  },
];

interface KeyProps {
  readonly children: string;
}

function Key({ children }: KeyProps): JSX.Element {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-[var(--color-active)] border border-[var(--color-border)] rounded text-xs font-medium text-[var(--color-text-secondary)]">
      {children}
    </kbd>
  );
}

export function KeyboardHelpModal(): JSX.Element | null {
  const { isKeyboardHelpModalOpen, closeKeyboardHelpModal } = useUIStore();

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeKeyboardHelpModal();
      }
    },
    [closeKeyboardHelpModal]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeKeyboardHelpModal();
      }
    };

    if (isKeyboardHelpModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isKeyboardHelpModalOpen, closeKeyboardHelpModal]);

  if (!isKeyboardHelpModalOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-help-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* Modal */}
      <div
        className="relative glass-bordered rounded-xl w-full max-w-md mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-row-border-strong)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]" id="keyboard-help-title">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={closeKeyboardHelpModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 rounded-md hover:bg-[var(--color-hover)] focus-ring btn-press"
            aria-label="Close (Escape)"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-5">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between py-1">
                      <span className="text-sm text-[var(--color-text-primary)]">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center gap-1">
                            <Key>{key}</Key>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {shortcut.combo ? '+' : '/'}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
