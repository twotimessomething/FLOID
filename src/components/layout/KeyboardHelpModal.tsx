import { useUIStore } from '../../stores/uiStore';
import { usePresence } from '../../hooks/usePresence';
import { useModalLayer } from '../../hooks/useModalLayer';
import { COMMANDS } from '../../commands/commands';
import { isDesktop } from '../../platform/detect';
import { comboCaps, isMacKeyboard, sentenceCase } from '../../utils/shortcutKeys';

interface Gesture {
  readonly description: string;
  readonly action: string;
}

interface Shortcut {
  readonly keys: readonly string[];
  readonly description: string;
  readonly combo?: boolean; // true = keys joined with "+", false/undefined = alternatives
}

/** Decided once: a session never changes keyboards under the sheet. */
const IS_MAC = isMacKeyboard();

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
  { description: 'Drop a task on any day', action: IS_MAC ? '⌥-click' : 'Alt-click' },
  { description: 'Check a task off, or uncheck it', action: 'Click its circle' },
  { description: 'Move an item, or carry it to another schedule', action: 'Drag' },
  { description: 'Group an item inside a bar', action: 'Drop it on the bar' },
  { description: 'Take an item back out of its group', action: 'Drop it on open space' },
  { description: 'Resize a bar', action: 'Drag its edge' },
  { description: 'Link a bar to another item', action: 'Drag the dot at its end' },
  { description: 'Remove a link', action: 'Drop its end on open space' },
  { description: 'Open or close a group', action: 'Double-click the bar' },
  { description: 'Rename a schedule, item, or project', action: 'Double-click its name' },
  { description: 'Color, lock, move out of group, export', action: 'Right-click' },
  { description: 'Move around the timeline', action: 'Middle-drag or right-drag' },
];

const COMMAND_GROUP_TITLES: Record<string, string> = {
  project: 'Project',
  edit: 'History',
  view: 'View',
};

/**
 * Command combos print straight from the registry, so this list cannot drift
 * from what the keys (or the native menu) actually do. Combos the browser
 * refuses to hand over are left out rather than promised.
 */
function commandShortcutGroups(): ShortcutGroup[] {
  const groups = new Map<string, Shortcut[]>();
  for (const command of Object.values(COMMANDS)) {
    if (!command.shortcutKeys) continue;
    if (command.browserReserved && !isDesktop()) continue;
    const title = COMMAND_GROUP_TITLES[command.id.split('.')[0]];
    if (!title) continue;
    const list = groups.get(title) ?? [];
    list.push({
      keys: comboCaps(command.shortcutKeys, IS_MAC),
      // The registry's labels are the menu bar's Title Case; the sheet is in-app copy
      description: sentenceCase(command.label),
      combo: true,
    });
    groups.set(title, list);
  }
  return [...groups.entries()].map(([title, shortcuts]) => ({ title, shortcuts }));
}

const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [{ keys: ['↑', '↓'], description: 'Select previous / next row' }],
  },
  {
    title: 'Actions',
    // Return opens the editor and Space folds, as `useKeyboardShortcuts` has
    // them. A Mac's delete key is ⌫, and the one key there is to name.
    shortcuts: [
      { keys: [IS_MAC ? 'Return' : 'Enter'], description: 'Edit the selected row' },
      { keys: ['Space'], description: 'Open or close a schedule or group' },
      {
        keys: IS_MAC ? ['⌫'] : ['Delete', 'Backspace'],
        description: 'Delete the selection',
      },
      { keys: ['Esc'], description: 'Close the editor, deselect, or cancel a drag' },
    ],
  },
  ...commandShortcutGroups(),
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

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(isKeyboardHelpModalOpen);
  const { panelRef, backdropProps } = useModalLayer({
    isOpen: isKeyboardHelpModalOpen,
    isMounted,
    onDismiss: closeKeyboardHelpModal,
  });
  if (!isMounted) return null;

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      {...backdropProps}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-help-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--color-scrim)] pointer-events-none" />

      {/* Modal */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-md mx-4 outline-none modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h2
            className="text-title font-medium text-[var(--color-text-primary)]"
            id="keyboard-help-title"
          >
            Shortcuts &amp; gestures
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
                    <span className="text-body text-[var(--color-text-primary)]">
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
                      <span className="text-body text-[var(--color-text-primary)]">
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
