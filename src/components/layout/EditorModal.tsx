import { useEffect, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { usePresence } from '../../hooks/usePresence';
import { useModalLayer } from '../../hooks/useModalLayer';
import { useFloatingPanelSize } from '../../hooks/useFloatingPanelSize';
import { useIsTaskPointer } from '../../hooks/useTaskPointer';
import { SectionEditor } from '../panels/SectionEditor';
import { ItemEditor } from '../panels/ItemEditor';
import type { SelectionState } from '../../types';
import { keyBelongsToGesture } from '../../commands/gesture';
import { placeFloatingPanel } from '../../utils/floatingPanel';
import { isImeComposing } from '../../utils/keyboard';

const MODAL_WIDTH = 280;
const VIEWPORT_PADDING = 16;
/** Between the click and a panel that had to open to its left. */
const FLIP_GAP = 8;

/** Inputs that are pressed rather than typed into: Return is theirs. */
const PRESSED_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && !PRESSED_INPUT_TYPES.has(target.type);
}

export function EditorModal(): JSX.Element | null {
  const { isModalOpen, selection, closeModal } = useUIStore();
  const shownRef = useRef<SelectionState | null>(null);
  // Under the task pointer the backdrop steps aside: the next ⌥-click is the
  // next task, and the editor simply moves to it. The panel itself stays live.
  const isTaskPointer = useIsTaskPointer();

  const isOpen = isModalOpen && selection.type !== null && selection.id !== null;
  const { isMounted, isLeaving } = usePresence(isOpen);
  // Escape and the backdrop close it; the sheet's keys still reach the rows
  // under it, so it does not count as covering them
  const { panelRef, backdropProps } = useModalLayer({
    isOpen,
    isMounted,
    onDismiss: closeModal,
    isBlocking: false,
  });

  // Return in one of its fields saves and closes. Anywhere else it belongs to
  // whatever has focus — a swatch, the Done toggle, Delete, or a field in a
  // modal raised over the editor — and presses it.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // A key pressed while something is in the hand belongs to that gesture
      if (keyBelongsToGesture(e)) return;
      if (e.key !== 'Enter' || isImeComposing(e) || !isTextField(e.target)) return;
      if (!panelRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      closeModal();
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isModalOpen, closeModal, panelRef]);
  const { height, viewportWidth, viewportHeight } = useFloatingPanelSize(panelRef, isMounted);

  // Closing drops the selection, and the panel is still on screen for the
  // length of its exit. It leaves showing what it was editing, not an empty box.
  if (selection.type && selection.id) shownRef.current = selection;
  const shown = isModalOpen ? selection : shownRef.current;

  if (!isMounted || !shown?.type || !shown.id) return null;

  const position = shown.position;

  // As tall as the editor needs, up to the window; moved up rather than
  // squeezed when it would run off the bottom
  const getModalStyle = (): React.CSSProperties => {
    if (!position) {
      // Fallback to center of screen if no position
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxHeight: viewportHeight - VIEWPORT_PADDING * 2,
      };
    }

    const { left, top, maxHeight } = placeFloatingPanel({
      anchorX: position.x,
      anchorY: position.y,
      width: MODAL_WIDTH,
      height,
      viewportWidth,
      viewportHeight,
      padding: VIEWPORT_PADDING,
      flipGap: FLIP_GAP,
    });
    return { left: `${left}px`, top: `${top}px`, maxHeight };
  };

  const renderEditor = (): JSX.Element | null => {
    switch (shown.type) {
      case 'section':
        return <SectionEditor selection={shown} />;
      case 'item':
        // Keyed by item: a task dropped while the panel is already open is a
        // new thing to name, so the panel comes up fresh with its name field
        // focused rather than carrying focus the click just took away.
        return <ItemEditor key={shown.id} selection={shown} />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 ${isLeaving ? 'is-leaving' : ''} ${
        isTaskPointer ? 'pointer-events-none' : ''
      }`}
      {...backdropProps}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="fixed flex flex-col pointer-events-auto bg-[var(--color-raised)] border border-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] shadow-lg outline-none modal-enter"
        style={{
          width: MODAL_WIDTH,
          ...getModalStyle(),
        }}
        role="document"
      >
        <div className="flex flex-shrink-0 items-center justify-between px-4 py-3">
          <h2 className="text-title font-medium text-[var(--color-text-primary)]" id="modal-title">
            Edit
          </h2>
          <button
            onClick={closeModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--color-hover)] focus-ring btn-press"
            aria-label="Close (Escape)"
          >
            <svg
              className="w-4 h-4"
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
        <div className="min-h-0 flex-1 p-4 overflow-y-auto" aria-labelledby="modal-title">
          {renderEditor()}
        </div>
      </div>
    </div>
  );
}
