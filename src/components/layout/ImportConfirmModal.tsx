import { useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { formatDate, getSectionsDateRange } from '../../utils/dateUtils';
import type { ImportAnalysis, ImportModalType, ImportOptions } from '../../types';
import { usePresence } from '../../hooks/usePresence';
import { useModalLayer } from '../../hooks/useModalLayer';
import { isImeComposing } from '../../utils/keyboard';

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
  const [seededFor, setSeededFor] = useState<ImportAnalysis | null>(null);
  const lastContentRef = useRef<{ type: ImportModalType; analysis: ImportAnalysis } | null>(null);

  // Seeded while rendering, not in an effect, so the field mounts holding the
  // suggestion and the focus that selects it has the whole name to select
  if (isOpen && type === 'name-collision' && analysis && seededFor !== analysis) {
    setSeededFor(analysis);
    setNewName(`${analysis.importData.schedule.name} (Imported)`);
  }

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

  // Return in the name field imports, once. Escape is the layer's.
  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || isImeComposing(e)) return;
      e.preventDefault();
      handleRename();
    },
    [handleRename]
  );

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const isShown = isOpen && type !== null && analysis !== null;
  const { isMounted, isLeaving } = usePresence(isShown);
  // The name field asks for focus with `data-autofocus`, which the layer
  // honours once the panel is really there — every time it opens, not just
  // the first, when the lazy chunk happened to mount it already open.
  const { panelRef, backdropProps } = useModalLayer({
    isOpen: isShown,
    isMounted,
    onDismiss: handleCancel,
  });

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

  // Revisions are bookkeeping: the sentence says newer or older in words, and
  // the numbers sit under it for anyone who wants to check
  const revisionDetail =
    existingSection && existingSection.revision !== importData.schedule.revision
      ? `Revision ${existingSection.revision} → ${importData.schedule.revision}`
      : `Revision ${importData.schedule.revision}`;

  const renderContent = (): JSX.Element | null => {
    switch (shownType) {
      case 'new-schedule':
        return (
          <>
            <h2
              id="import-modal-title"
              className="text-title font-medium text-[var(--color-text-primary)] mb-2"
            >
              Import schedule
            </h2>
            <p className="text-body text-[var(--color-text-secondary)] mb-4">
              Import “{importData.schedule.name}” from the project “{importData.sourceProjectName}”?
            </p>

            {/* Info message when importing from same project */}
            {isFromSameProject && (
              <div className="bg-[var(--color-selection)] text-[var(--color-focus)] rounded-[var(--radius-md)] p-3 mb-4 text-body">
                <p>This schedule came from this project.</p>
              </div>
            )}

            {/* Date comparison if mismatch */}
            {dateMismatch && currentDateRange && (
              <div className="bg-[var(--color-background)] rounded-[var(--radius-md)] p-4 mb-4 space-y-3">
                <p className="text-xs font-medium text-[var(--color-text-muted)]">
                  Its dates don’t match this project’s
                </p>
                <div className="grid grid-cols-2 gap-4 text-body">
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">Imported</p>
                    <p className="text-[var(--color-text-primary)]">
                      {formatDate(importData.scheduleDates.startDate)} – {formatDate(importData.scheduleDates.endDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">This project</p>
                    <p className="text-[var(--color-text-primary)]">
                      {formatDate(currentDateRange.startDate)} – {formatDate(currentDateRange.endDate)}
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
            <h2
              id="import-modal-title"
              className="text-title font-medium text-[var(--color-text-primary)] mb-2"
            >
              Update schedule
            </h2>
            <p className="text-body text-[var(--color-text-secondary)]">
              {revisionDelta && revisionDelta > 0
                ? `This copy of “${existingSection?.name}” is newer than the one you have.`
                : revisionDelta && revisionDelta < 0
                ? `This copy of “${existingSection?.name}” is older than the one you have.`
                : `This copy of “${existingSection?.name}” is the same version as the one you have.`}
            </p>
            <p className="text-meta text-[var(--color-text-muted)] mt-1 mb-4">{revisionDetail}</p>

            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={handleCancel}>
                Keep current
              </Button>
              <Button variant="primary" onClick={handleImport}>
                {revisionDelta && revisionDelta < 0 ? 'Import anyway' : 'Update'}
              </Button>
            </div>
          </>
        );

      case 'name-collision':
        return (
          <>
            <h2
              id="import-modal-title"
              className="text-title font-medium text-[var(--color-text-primary)] mb-2"
            >
              Name already in use
            </h2>
            <p className="text-body text-[var(--color-text-secondary)] mb-4">
              There’s already a schedule called “{existingSection?.name}”. Give the one you’re
              importing a name of its own.
            </p>
            <div className="mb-4">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                aria-label="Name for the imported schedule"
                placeholder="Schedule name"
                onKeyDown={handleNameKeyDown}
                data-autofocus=""
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
                Import with this name
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
      {...backdropProps}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--color-scrim)] pointer-events-none" aria-hidden="true" />

      {/* Modal */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg max-w-md w-full mx-4 p-6 outline-none modal-enter"
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
