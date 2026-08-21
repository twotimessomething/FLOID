import { useCallback, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';

interface Gesture {
  readonly description: string;
  readonly action: string;
}

interface Shortcut {
  readonly keys: readonly string[];
  readonly description: string;
  readonly combo?: boolean; // true = keys joined with "+", false/undefined = alternatives
}

interface ShortcutGroup {
  readonly title: string;
  readonly shortcuts: readonly Shortcut[];
}

/**
 * Mouse gestures carry the timeline, so they lead. They are listed as plain
 * ink rather than keycaps — a drag is not a key, and printing it as one reads
 * as a control that can be pressed.
 */
const GESTURES: readonly Gesture[] = [
  { description: 'Draw a bar in empty space', action: 'Double-click' },
  { description: 'Draw a bar to an exact span', action: 'Drag' },
  { description: 'Add a milestone to a schedule row', action: 'Double-click' },
  { description: 'Move an item, or carry it to another schedule', action: 'Drag' },
  { description: 'Group an item inside a bar', action: 'Drop it on the bar' },
  { description: 'Take an item back out of its group', action: 'Drop it on open space' },
  { description: 'Resize a bar', action: 'Drag its edge' },
  { description: 'Open or close a group', action: 'Double-click the bar' },
  { description: 'Color, lock, move out of group, export', action: 'Right-click' },
];

const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [{ keys: ['↑', '↓'], description: 'Select previous / next row' }],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['Enter', 'Space'], description: 'Expand / Collapse a schedule or group' },
      { keys: ['Delete', '⌫'], description: 'Delete selected item' },
      { keys: ['Esc'], description: 'Close the editor, or cancel a drag' },
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
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-[var(--color-active)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-text-secondary)]">
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
      <div className="absolute inset-0 bg-black/25" />

      {/* Modal */}
      <div
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-md mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h2
            className="text-sm font-medium text-[var(--color-text-primary)]"
            id="keyboard-help-title"
          >
            Shortcuts &amp; Gestures
          </h2>
          <button
            onClick={closeKeyboardHelpModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--color-hover)] focus-ring btn-press"
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
            <div>
              <h3 className="eyebrow mb-2">Gestures</h3>
              <div className="space-y-2">
                {GESTURES.map((gesture) => (
                  <div
                    key={gesture.description}
                    className="flex items-center justify-between gap-4 py-1"
                  >
                    <span className="text-sm text-[var(--color-text-primary)]">
                      {gesture.description}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                      {gesture.action}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="eyebrow mb-2">{group.title}</h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 py-1">
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
