import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { Button } from './Button';
import { usePresence } from '../../hooks/usePresence';

export function ConfirmDialog(): JSX.Element | null {
  const { confirmDialog, closeConfirmDialog } = useUIStore();
  const { isOpen, title, message, confirmLabel, cancelLabel, variant, onConfirm, onCancel } = confirmDialog;
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button when dialog opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  const handleConfirm = useCallback(() => {
    onConfirm?.();
    closeConfirmDialog();
  }, [onConfirm, closeConfirmDialog]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    closeConfirmDialog();
  }, [onCancel, closeConfirmDialog]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    },
    [handleCancel]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [handleCancel]
  );

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(isOpen);
  if (!isMounted) return null;

  const confirmButtonVariant = variant === 'danger' ? 'danger' : 'primary';

  return createPortal(
    <div
      className={`modal-layer fixed inset-0 z-[200] flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/25" aria-hidden="true" />

      {/* Dialog */}
      <div
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg max-w-sm w-full mx-4 modal-enter"
        role="alertdialog"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-2">
          <h2
            id="confirm-dialog-title"
            className="text-sm font-medium text-[var(--color-text-primary)]"
          >
            {title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 pb-2">
          <p
            id="confirm-dialog-message"
            className="text-sm text-[var(--color-text-secondary)] whitespace-pre-line"
          >
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 pt-2 pb-5">
          <Button variant="ghost" onClick={handleCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmButtonRef}
            variant={confirmButtonVariant}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
