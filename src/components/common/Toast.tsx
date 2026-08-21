import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore, type ToastState, type ToastType } from '../../stores/uiStore';

const DOT_COLORS: Record<ToastType, string> = {
  success: 'bg-[var(--color-success)]',
  error: 'bg-[var(--color-error)]',
  warning: 'bg-[var(--color-warning)]',
};

/** How long the toast takes to leave. Must match `.toast-slide-out`. */
const EXIT_MS = 160;

export function Toast(): JSX.Element | null {
  const toast = useUIStore((state) => state.toast);
  const hideToast = useUIStore((state) => state.hideToast);

  /**
   * The toast on its way out, held by identity rather than as a flag.
   * `showToast` replaces the whole object, so the next toast is never mistaken
   * for the one leaving and there is no stale flag to clear between them.
   */
  const [leaving, setLeaving] = useState<ToastState | null>(null);
  const isLeaving = leaving === toast;

  useEffect(() => {
    if (!toast.isVisible) return;

    const leaveTimer = setTimeout(() => setLeaving(toast), toast.duration);
    const removeTimer = setTimeout(hideToast, toast.duration + EXIT_MS);

    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(removeTimer);
    };
  }, [toast, hideToast]);

  const handleDismiss = useCallback(() => {
    setLeaving(toast);
    // Anything shown while this one leaves is a different toast, and keeps its life.
    setTimeout(() => {
      if (useUIStore.getState().toast === toast) hideToast();
    }, EXIT_MS);
  }, [toast, hideToast]);

  /** Acting on a toast answers it, so it leaves the same way dismissing does. */
  const handleAction = useCallback(() => {
    toast.action?.onClick();
    handleDismiss();
  }, [toast, handleDismiss]);

  if (!toast.isVisible) return null;

  return createPortal(
    <div
      className={`fixed bottom-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-md ${
        isLeaving ? 'toast-slide-out' : 'toast-slide-in'
      }`}
      role="alert"
      aria-live="polite"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_COLORS[toast.type]}`}
        aria-hidden="true"
      />
      <span className="text-body text-[var(--color-text-primary)]">{toast.message}</span>
      {toast.action && (
        <button
          onClick={handleAction}
          className="flex-shrink-0 -my-1 px-2 py-1 rounded-[var(--radius-sm)] text-body font-medium text-[var(--color-text-primary)] underline underline-offset-2 decoration-[var(--color-border)] hover:decoration-current hover:bg-[var(--color-hover)] transition-colors duration-fast btn-press focus-ring"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={handleDismiss}
        className="ml-2 p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] btn-press focus-ring"
        aria-label="Dismiss notification"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>,
    document.body
  );
}
