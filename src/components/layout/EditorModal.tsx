import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { usePresence } from '../../hooks/usePresence';
import { SectionEditor } from '../panels/SectionEditor';
import { ItemEditor } from '../panels/ItemEditor';
import type { SelectionState } from '../../types';

const MODAL_WIDTH = 280;
const MODAL_MAX_HEIGHT = 400;
const VIEWPORT_PADDING = 16;

export function EditorModal(): JSX.Element | null {
  const { isModalOpen, selection, closeModal } = useUIStore();
  const modalRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef<SelectionState | null>(null);

  // Close on escape key or enter key (save and close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeModal();
      }
      // Enter closes modal unless user is in a textarea
      if (e.key === 'Enter' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        closeModal();
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isModalOpen, closeModal]);

  // Close when clicking outside
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeModal();
      }
    },
    [closeModal]
  );

  const { isMounted, isLeaving } = usePresence(
    isModalOpen && selection.type !== null && selection.id !== null
  );

  // Closing drops the selection, and the panel is still on screen for the
  // length of its exit. It leaves showing what it was editing, not an empty box.
  if (selection.type && selection.id) shownRef.current = selection;
  const shown = isModalOpen ? selection : shownRef.current;

  if (!isMounted || !shown?.type || !shown.id) return null;

  const position = shown.position;

  // Calculate modal position
  const getModalStyle = (): React.CSSProperties => {
    if (!position) {
      // Fallback to center of screen if no position
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = position.x;
    let top = position.y;

    // Adjust if modal would overflow right edge
    if (left + MODAL_WIDTH + VIEWPORT_PADDING > viewportWidth) {
      left = position.x - MODAL_WIDTH - 8;
    }

    // Adjust if modal would overflow bottom edge
    if (top + MODAL_MAX_HEIGHT + VIEWPORT_PADDING > viewportHeight) {
      top = viewportHeight - MODAL_MAX_HEIGHT - VIEWPORT_PADDING;
    }

    // Ensure minimum distance from edges
    left = Math.max(VIEWPORT_PADDING, left);
    top = Math.max(VIEWPORT_PADDING, top);

    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  };

  const renderEditor = (): JSX.Element | null => {
    switch (shown.type) {
      case 'section':
        return <SectionEditor selection={shown} />;
      case 'item':
        return <ItemEditor selection={shown} />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="fixed bg-[var(--color-raised)] border border-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] shadow-lg modal-enter"
        style={{
          width: MODAL_WIDTH,
          maxHeight: MODAL_MAX_HEIGHT,
          ...getModalStyle(),
        }}
        role="document"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]" id="modal-title">
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
        <div
          className="p-4 overflow-y-auto"
          style={{ maxHeight: MODAL_MAX_HEIGHT - 52 }}
          aria-labelledby="modal-title"
        >
          {renderEditor()}
        </div>
      </div>
    </div>
  );
}
