import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../../stores/uiStore';
import {
  PhaseEditor,
  ElementEditor,
  MilestoneEditor,
  SectionEditor,
} from '../panels';

const MODAL_WIDTH = 280;
const MODAL_MAX_HEIGHT = 400;
const VIEWPORT_PADDING = 16;

export function EditorModal(): JSX.Element | null {
  const { isModalOpen, selection, closeModal } = useUIStore();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on escape key or enter key (save and close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  if (!isModalOpen || !selection.type || !selection.id) {
    return null;
  }

  const position = selection.position;

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
    switch (selection.type) {
      case 'section':
        return <SectionEditor />;
      case 'phase':
        return <PhaseEditor />;
      case 'element':
        return <ElementEditor />;
      case 'milestone':
        return <MilestoneEditor />;
      default:
        return null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="fixed glass-bordered overflow-hidden rounded-xl modal-enter"
        style={{
          width: MODAL_WIDTH,
          maxHeight: MODAL_MAX_HEIGHT,
          ...getModalStyle(),
        }}
        role="document"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]" id="modal-title">
            Edit
          </h2>
          <button
            onClick={closeModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 rounded-md hover:bg-black/5 focus-ring btn-press"
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
