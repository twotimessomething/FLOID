import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { Button } from './Button';

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

  if (!isOpen) return null;

  const confirmButtonVariant = variant === 'danger' ? 'danger' : 'primary';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" aria-hidden="true" />

      {/* Dialog */}
      <div
        className="relative glass-bordered rounded-xl max-w-sm w-full mx-4 modal-enter"
        role="alertdialog"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/20">
          <h2
            id="confirm-dialog-title"
            className="text-base font-semibold text-[var(--color-text-primary)]"
          >
            {title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p
            id="confirm-dialog-message"
            className="text-sm text-[var(--color-text-secondary)] whitespace-pre-line"
          >
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-white/20">
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
