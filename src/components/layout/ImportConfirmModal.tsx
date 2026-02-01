import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { useSectionStore, selectMasterSection } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { formatDate } from '../../utils/dateUtils';
import type { ImportOptions } from '../../types';

interface ImportConfirmModalProps {
  readonly onConfirm: (options: ImportOptions) => void;
}

export function ImportConfirmModal({ onConfirm }: ImportConfirmModalProps): JSX.Element | null {
  const { importModal, closeImportModal } = useUIStore();
  const masterSection = useSectionStore(selectMasterSection);
  const project = useProjectStore((state) => state.project);
  const { isOpen, type, analysis } = importModal;

  // Use master section's date range as the "current project" dates for comparison
  const currentDateRange = useMemo(() => {
    if (masterSection) {
      return { startDate: masterSection.startDate, endDate: masterSection.endDate };
    }
    return null;
  }, [masterSection]);

  const [newName, setNewName] = useState('');
  const [rescaleToMaster, setRescaleToMaster] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && type === 'name-collision' && analysis) {
      setNewName(`${analysis.importData.schedule.name} (Imported)`);
    }
    // Reset rescale option when modal opens
    setRescaleToMaster(false);
  }, [isOpen, type, analysis]);

  useEffect(() => {
    if (isOpen && type === 'name-collision' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen, type]);

  const handleCancel = useCallback(() => {
    closeImportModal();
  }, [closeImportModal]);

  const handleImport = useCallback(() => {
    onConfirm({ rescaleToMaster });
    closeImportModal();
  }, [onConfirm, rescaleToMaster, closeImportModal]);

  const handleRename = useCallback(() => {
    if (newName.trim()) {
      onConfirm({ rescaleToMaster, newName: newName.trim() });
      closeImportModal();
    }
  }, [onConfirm, rescaleToMaster, newName, closeImportModal]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && type === 'name-collision' && newName.trim()) {
        handleRename();
      }
    },
    [handleCancel, handleRename, type, newName]
  );

  if (!isOpen || !type || !analysis) return null;

  const { importData, dateMismatch, revisionDelta, existingSection } = analysis;

  // Check if importing from same project
  const isFromSameProject = project && importData.sourceProjectId === project.id;

  const renderContent = () => {
    switch (type) {
      case 'new-schedule':
        return (
          <>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              Import Schedule
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Import "{importData.schedule.name}" from project "{importData.sourceProjectName}"?
            </p>

            {/* Info message when importing from same project */}
            {isFromSameProject && (
              <div className="bg-blue-50 text-blue-700 rounded-lg p-3 mb-4 text-sm">
                <p>This schedule originated from this project.</p>
              </div>
            )}

            {/* Date comparison if mismatch */}
            {dateMismatch && currentDateRange && (
              <div className="bg-[var(--color-background)] rounded-lg p-4 mb-4 space-y-3">
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  Note: Different date ranges
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">Imported:</p>
                    <p className="text-[var(--color-text-primary)]">
                      {formatDate(importData.scheduleDates.startDate)} — {formatDate(importData.scheduleDates.endDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">Current:</p>
                    <p className="text-[var(--color-text-primary)]">
                      {formatDate(currentDateRange.startDate)} — {formatDate(currentDateRange.endDate)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Rescale option */}
            <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={rescaleToMaster}
                onChange={(e) => setRescaleToMaster(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Rescale to fit master schedule
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  Scale the schedule to match your master schedule's date range and lock it.
                </p>
              </div>
            </label>

            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleImport}>
                Import
              </Button>
            </div>
          </>
        );

      case 'update':
        return (
          <>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              Update Schedule
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {revisionDelta && revisionDelta > 0
                ? `A newer version of "${existingSection?.name}" is available (r${existingSection?.revision} → r${importData.schedule.revision}).`
                : revisionDelta && revisionDelta < 0
                ? `Warning: This is an older version (r${existingSection?.revision} → r${importData.schedule.revision}).`
                : `The imported schedule has the same revision (r${importData.schedule.revision}).`}
            </p>

            {/* Rescale option */}
            <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={rescaleToMaster}
                onChange={(e) => setRescaleToMaster(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Rescale to fit master schedule
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  Scale the schedule to match your master schedule's date range.
                </p>
              </div>
            </label>

            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={handleCancel}>
                Keep Current
              </Button>
              <Button variant="primary" onClick={handleImport}>
                {revisionDelta && revisionDelta < 0 ? 'Import Anyway' : 'Update'}
              </Button>
            </div>
          </>
        );

      case 'name-collision':
        return (
          <>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
              Schedule Name Already Exists
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              A schedule named "{existingSection?.name}" already exists. Please enter a new name for
              the imported schedule.
            </p>
            <div className="mb-4">
              <Input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter new schedule name"
                onKeyDown={handleKeyDown}
              />
            </div>

            {/* Rescale option */}
            <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-hover)] transition-colors cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={rescaleToMaster}
                onChange={(e) => setRescaleToMaster(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Rescale to fit master schedule
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  Scale the schedule to match your master schedule's date range.
                </p>
              </div>
            </label>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleRename}
                disabled={!newName.trim()}
              >
                Import with New Name
              </Button>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 modal-enter"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
      >
        {renderContent()}
      </div>
    </div>,
    document.body
  );
}
