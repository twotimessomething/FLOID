import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore, type ToastType } from '../../stores/uiStore';

const ICONS: Record<ToastType, JSX.Element> = {
  success: (
    <svg
      className="w-5 h-5 text-[var(--color-success)]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  ),
  error: (
    <svg
      className="w-5 h-5 text-[var(--color-error)]"
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
  ),
  warning: (
    <svg
      className="w-5 h-5 text-[var(--color-warning)]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
};

const BG_COLORS: Record<ToastType, string> = {
  success: 'bg-[var(--color-success-bg)] border-[var(--color-success)]',
  error: 'bg-[var(--color-error-bg)] border-[var(--color-error)]',
  warning: 'bg-[var(--color-warning-bg)] border-[var(--color-warning)]',
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
      className={`fixed bottom-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg toast-slide-in ${BG_COLORS[type]}`}
      role="alert"
      aria-live="polite"
    >
      {ICONS[type]}
      <span className="text-sm text-[var(--color-text-primary)]">{message}</span>
      <button
        onClick={handleDismiss}
        className="ml-2 p-1 rounded hover:bg-black/5 transition-colors"
        aria-label="Dismiss notification"
      >
        <svg
          className="w-4 h-4 text-[var(--color-text-secondary)]"
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
