import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { formatDate, getSectionsDateRange } from '../../utils/dateUtils';
import type { ImportAnalysis, ImportModalType, ImportOptions } from '../../types';
import { usePresence } from '../../hooks/usePresence';

interface ImportConfirmModalProps {
  readonly onConfirm: (options: ImportOptions) => void;
}

export function ImportConfirmModal({ onConfirm }: ImportConfirmModalProps): JSX.Element | null {
  const { importModal, closeImportModal } = useUIStore();
  const sections = useSectionStore((state) => state.sections);
  const project = useProjectStore((state) => state.project);
  const { isOpen, type, analysis } = importModal;

  // Combined range of existing schedules, for the date comparison
  const currentDateRange = useMemo(() => getSectionsDateRange(sections), [sections]);

  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const lastContentRef = useRef<{ type: ImportModalType; analysis: ImportAnalysis } | null>(null);

  useEffect(() => {
    if (isOpen && type === 'name-collision' && analysis) {
      setNewName(`${analysis.importData.schedule.name} (Imported)`);
    }
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
    onConfirm({});
    closeImportModal();
  }, [onConfirm, closeImportModal]);

  const handleRename = useCallback(() => {
    if (newName.trim()) {
      onConfirm({ newName: newName.trim() });
      closeImportModal();
    }
  }, [onConfirm, newName, closeImportModal]);

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

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(isOpen && type !== null && analysis !== null);

  // The store drops the import the moment the modal is dismissed, but the panel
  // is still on screen for the length of its exit. Keep the last thing it was
  // asked to show so the closing frames are not blank.
  if (type && analysis) lastContentRef.current = { type, analysis };
  const content = type && analysis ? { type, analysis } : lastContentRef.current;

  if (!isMounted || !content) return null;

  const shownType = content.type;
  const { importData, dateMismatch, revisionDelta, existingSection } = content.analysis;

  // Check if importing from same project
  const isFromSameProject = project && importData.sourceProjectId === project.id;

  const renderContent = (): JSX.Element | null => {
    switch (shownType) {
      case 'new-schedule':
        return (
          <>
            <h2 className="text-title font-medium text-[var(--color-text-primary)] mb-2">
              Import Schedule
            </h2>
            <p className="text-body text-[var(--color-text-secondary)] mb-4">
              Import "{importData.schedule.name}" from project "{importData.sourceProjectName}"?
            </p>

            {/* Info message when importing from same project */}
            {isFromSameProject && (
              <div className="bg-[var(--color-selection)] text-[var(--color-focus)] rounded-[var(--radius-md)] p-3 mb-4 text-body">
                <p>This schedule originated from this project.</p>
              </div>
            )}

            {/* Date comparison if mismatch */}
            {dateMismatch && currentDateRange && (
              <div className="bg-[var(--color-background)] rounded-[var(--radius-md)] p-4 mb-4 space-y-3">
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  Note: Different date ranges
                </p>
                <div className="grid grid-cols-2 gap-4 text-body">
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
            <h2 className="text-title font-medium text-[var(--color-text-primary)] mb-2">
              Update Schedule
            </h2>
            <p className="text-body text-[var(--color-text-secondary)] mb-4">
              {revisionDelta && revisionDelta > 0
                ? `A newer version of "${existingSection?.name}" is available (r${existingSection?.revision} → r${importData.schedule.revision}).`
                : revisionDelta && revisionDelta < 0
                ? `Warning: This is an older version (r${existingSection?.revision} → r${importData.schedule.revision}).`
                : `The imported schedule has the same revision (r${importData.schedule.revision}).`}
            </p>

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
            <h2 className="text-title font-medium text-[var(--color-text-primary)] mb-2">
              Schedule Name Already Exists
            </h2>
            <p className="text-body text-[var(--color-text-secondary)] mb-4">
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
      className={`modal-layer fixed inset-0 z-[150] flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/25"
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg max-w-md w-full mx-4 p-6 modal-enter"
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
