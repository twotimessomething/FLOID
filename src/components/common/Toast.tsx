import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore, type ToastType } from '../../stores/uiStore';

const DOT_COLORS: Record<ToastType, string> = {
  success: 'bg-[var(--color-success)]',
  error: 'bg-[var(--color-error)]',
  warning: 'bg-[var(--color-warning)]',
};

export function Toast(): JSX.Element | null {
  const { toast, hideToast } = useUIStore();
  const { isVisible, type, message, duration } = toast;

  const handleDismiss = useCallback(() => {
    hideToast();
  }, [hideToast]);

  useEffect(() => {
    if (!isVisible) return;

    const timer = setTimeout(() => {
      hideToast();
    }, duration);

    return () => clearTimeout(timer);
  }, [isVisible, duration, hideToast]);

  if (!isVisible) return null;

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] toast-slide-in"
      role="alert"
      aria-live="polite"
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_COLORS[type]}`} aria-hidden="true" />
      <span className="text-[13px] text-[var(--color-text-primary)]">{message}</span>
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
