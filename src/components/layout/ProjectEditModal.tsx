import { useState, useCallback, useEffect } from 'react';
import { parseISO, format } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { Button, Input } from '../common';

export function ProjectEditModal(): JSX.Element | null {
  const { editingProjectId, closeProjectEditModal } = useUIStore();
  const updateProject = useProjectStore((state) => state.updateProject);
  const updateMasterDates = useSectionStore((state) => state.updateMasterDates);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Initialize form when modal opens with current project data
  useEffect(() => {
    if (editingProjectId) {
      const currentProject = useProjectStore.getState().project;
      setName(currentProject.name);
      // Convert ISO dates to YYYY-MM-DD for date inputs
      setStartDate(format(parseISO(currentProject.projectStartDate), 'yyyy-MM-dd'));
      setEndDate(format(parseISO(currentProject.projectEndDate), 'yyyy-MM-dd'));
    }
  }, [editingProjectId]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  const handleStartDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value);
  }, []);

  const handleEndDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const projectName = name.trim() || 'Untitled Project';
      updateProject({ name: projectName });

      // Update dates if they've changed (convert YYYY-MM-DD to ISO)
      const currentProject = useProjectStore.getState().project;
      const newStartISO = new Date(startDate).toISOString();
      const newEndISO = new Date(endDate).toISOString();

      if (
        newStartISO !== currentProject.projectStartDate ||
        newEndISO !== currentProject.projectEndDate
      ) {
        updateMasterDates(newStartISO, newEndISO);
      }

      closeProjectEditModal();
    },
    [name, startDate, endDate, updateProject, updateMasterDates, closeProjectEditModal]
  );

  if (!editingProjectId) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-edit-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* Modal */}
      <div
        className="relative glass-bordered rounded-xl w-full max-w-md mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]" id="project-edit-title">
            Edit Project
          </h2>
          <button
            onClick={closeProjectEditModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 rounded-md hover:bg-black/5 focus-ring btn-press"
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

            {/* Project Dates */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                value={startDate}
                onChange={handleStartDateChange}
                max={endDate}
              />
              <Input
                label="End Date"
                type="date"
                value={endDate}
                onChange={handleEndDateChange}
                min={startDate}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--color-border)]">
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
