import { useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { Button } from './Button';
import { usePresence } from '../../hooks/usePresence';
import { useModalLayer } from '../../hooks/useModalLayer';

export function ConfirmDialog(): JSX.Element | null {
  const { confirmDialog, closeConfirmDialog } = useUIStore();
  const { isOpen, title, message, confirmLabel, cancelLabel, variant, onConfirm, onCancel } = confirmDialog;

  const handleConfirm = useCallback(() => {
    onConfirm?.();
    closeConfirmDialog();
  }, [onConfirm, closeConfirmDialog]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    closeConfirmDialog();
  }, [onCancel, closeConfirmDialog]);

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(isOpen);
  const { panelRef, backdropProps } = useModalLayer({
    isOpen,
    isMounted,
    onDismiss: handleCancel,
  });
  if (!isMounted) return null;

  const isDanger = variant === 'danger';
  const confirmButtonVariant = isDanger ? 'danger' : 'primary';

  return createPortal(
    <div
      className={`modal-layer fixed inset-0 z-[200] flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      {...backdropProps}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--color-scrim)] pointer-events-none" aria-hidden="true" />

      {/* Dialog */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg max-w-sm w-full mx-4 outline-none modal-enter"
        role="alertdialog"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-2">
          <h2
            id="confirm-dialog-title"
            className="text-title font-medium text-[var(--color-text-primary)]"
          >
            {title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 pb-2">
          <p
            id="confirm-dialog-message"
            className="text-body text-[var(--color-text-secondary)] whitespace-pre-line"
          >
            {message}
          </p>
        </div>

        {/* Footer. A destructive action is never the default: Return on a
            danger confirm cancels, and deleting takes a deliberate press. */}
        <div className="flex justify-end gap-3 px-5 pt-2 pb-5">
          <Button variant="ghost" onClick={handleCancel} data-autofocus={isDanger ? '' : undefined}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmButtonVariant}
            onClick={handleConfirm}
            data-autofocus={isDanger ? undefined : ''}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
