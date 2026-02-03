import { useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const openConfirmDialog = useUIStore((state) => state.openConfirmDialog);

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        openConfirmDialog({
          ...options,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
    },
    [openConfirmDialog]
  );

  return confirm;
}
