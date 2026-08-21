import { useState, useCallback, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { Button, Input } from '../common';
import { usePresence } from '../../hooks/usePresence';

export function ProjectEditModal(): JSX.Element | null {
  const { editingProjectId, closeProjectEditModal } = useUIStore();
  const updateProject = useProjectStore((state) => state.updateProject);

  const [name, setName] = useState('');

  // Initialize form when modal opens with current project data
  useEffect(() => {
    if (editingProjectId) {
      const currentProject = useProjectStore.getState().project;
      setName(currentProject.name);
    }
  }, [editingProjectId]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeProjectEditModal();
      }
    };

    if (editingProjectId) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [editingProjectId, closeProjectEditModal]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeProjectEditModal();
      }
    },
    [closeProjectEditModal]
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const projectName = name.trim() || 'Untitled Project';
      updateProject({ name: projectName });
      closeProjectEditModal();
    },
    [name, updateProject, closeProjectEditModal]
  );

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(editingProjectId !== null);
  if (!isMounted) return null;

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-edit-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/25" />

      {/* Modal */}
      <div
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-md mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]" id="project-edit-title">
            Edit Project
          </h2>
          <button
            onClick={closeProjectEditModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded-[var(--radius-sm)] hover:bg-[var(--color-hover)] focus-ring btn-press"
            aria-label="Close (Escape)"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-5">
            {/* Project Name */}
            <Input
              label="Project Name"
              value={name}
              onChange={handleNameChange}
              placeholder="Product Development"
              autoFocus
            />

            <p className="text-xs text-[var(--color-text-muted)]">
              Project dates follow your schedules — edit a schedule's date range to change them.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="secondary" onClick={closeProjectEditModal}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
