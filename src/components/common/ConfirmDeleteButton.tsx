import { useState, useCallback } from 'react';
import { Button } from './Button';

interface ConfirmDeleteButtonProps {
  readonly label: string;
  readonly onConfirm: () => void;
  readonly className?: string;
}

export function ConfirmDeleteButton({
  label,
  onConfirm,
  className = '',
}: ConfirmDeleteButtonProps): JSX.Element {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleInitialClick = useCallback(() => {
    setIsConfirming(true);
  }, []);

  const handleCancel = useCallback(() => {
    setIsConfirming(false);
  }, []);

  const handleConfirm = useCallback(() => {
    setIsConfirming(false);
    onConfirm();
  }, [onConfirm]);

  if (isConfirming) {
    return (
      <div className={`flex gap-2 ${className}`}>
        <Button variant="secondary" onClick={handleCancel} className="flex-1">
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirm} className="flex-1">
          Confirm
        </Button>
      </div>
    );
  }

  return (
    <Button variant="danger" onClick={handleInitialClick} className={`w-full ${className}`}>
      {label}
    </Button>
  );
}
