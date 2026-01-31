import { useState, useCallback, useEffect } from 'react';
import { addMonths } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useTeamStore } from '../../stores/teamStore';
import { Button, Input, DateInput } from '../common';

interface ProjectFormData {
  name: string;
  startDate: Date;
  endDate: Date;
}

const getDefaultFormData = (): ProjectFormData => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = addMonths(startDate, 12);
  return {
    name: '',
    startDate,
    endDate,
  };
};

export function ProjectSetupModal(): JSX.Element | null {
  const { isProjectSetupModalOpen, closeProjectSetupModal, closeModal } = useUIStore();
  const { addProject, selectProject, saveCurrentProject } = useProjectStore();
  const { phases, loadPhasesForProject } = useTimelineStore();
  const { teams, loadTeamsForProject } = useTeamStore();

  const [formData, setFormData] = useState<ProjectFormData>(getDefaultFormData);

  // Reset form when modal opens
  useEffect(() => {
    if (isProjectSetupModalOpen) {
      setFormData(getDefaultFormData());
    }
  }, [isProjectSetupModalOpen]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeProjectSetupModal();
      }
    };

    if (isProjectSetupModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isProjectSetupModalOpen, closeProjectSetupModal]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeProjectSetupModal();
      }
    },
    [closeProjectSetupModal]
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, name: e.target.value }));
  }, []);

  const handleStartDateChange = useCallback((date: Date) => {
    setFormData((prev) => {
      // If end date is before new start date, adjust it
      const newEndDate = date > prev.endDate ? addMonths(date, 12) : prev.endDate;
      return { ...prev, startDate: date, endDate: newEndDate };
    });
  }, []);

  const handleEndDateChange = useCallback((date: Date) => {
    setFormData((prev) => ({ ...prev, endDate: date }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const name = formData.name.trim() || 'New Project';
      const startDate = formData.startDate.toISOString();
      const endDate = formData.endDate.toISOString();

      // Save current project before creating new one
      saveCurrentProject(phases, teams);

      // Create the new project
      const newId = addProject({ name, startDate, endDate });

      // Clear selection and switch to new project
      closeModal();
      selectProject(newId);
      loadPhasesForProject(newId);
      loadTeamsForProject(newId);

      closeProjectSetupModal();
    },
    [
      formData,
      phases,
      teams,
      saveCurrentProject,
      addProject,
      selectProject,
      loadPhasesForProject,
      loadTeamsForProject,
      closeModal,
      closeProjectSetupModal,
    ]
  );

  if (!isProjectSetupModalOpen) {
    return null;
  }

  const isValid = formData.startDate < formData.endDate;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-setup-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative glass-bordered rounded-xl w-full max-w-md mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
          <h2 className="text-base font-semibold text-[#111827]" id="project-setup-title">
            New Project
          </h2>
          <button
            onClick={closeProjectSetupModal}
            className="p-1 text-[#9ca3af] hover:text-[#6b7280] transition-colors duration-150 rounded-md hover:bg-black/5 focus-ring btn-press"
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
              value={formData.name}
              onChange={handleNameChange}
              placeholder="Product Development"
              autoFocus
            />

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <DateInput
                label="Start Date"
                value={formData.startDate}
                onChange={handleStartDateChange}
              />
              <DateInput
                label="End Date"
                value={formData.endDate}
                onChange={handleEndDateChange}
                min={formData.startDate}
              />
            </div>

            {/* Duration indicator */}
            <p className="text-xs text-[#9ca3af]">
              Project duration:{' '}
              {Math.round(
                (formData.endDate.getTime() - formData.startDate.getTime()) /
                  (1000 * 60 * 60 * 24 * 30)
              )}{' '}
              months
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#e5e7eb]">
            <Button type="button" variant="secondary" onClick={closeProjectSetupModal}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!isValid}>
              Create Project
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
