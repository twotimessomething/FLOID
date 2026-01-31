import { useState, useCallback, useEffect, useMemo } from 'react';
import { addMonths } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { Button, Input, DateInput } from '../common';
import type { Section } from '../../types';

interface ProjectFormData {
  name: string;
  startDate: Date;
  endDate: Date;
}

interface OriginalDates {
  startDate: Date;
  endDate: Date;
}

// Helper to recalculate relative position to preserve absolute date
function recalculateRelativePosition(
  oldRelative: number,
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number
): number {
  // Calculate absolute timestamp from old relative position
  const absoluteTime = oldStart + oldRelative * (oldEnd - oldStart);
  // Calculate new relative position
  const newDuration = newEnd - newStart;
  if (newDuration <= 0) return 0;
  const newRelative = (absoluteTime - newStart) / newDuration;
  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, newRelative));
}

// Recalculate all timeline positions to preserve absolute dates
function recalculateSectionPositions(
  sections: Section[],
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number
): Section[] {
  return sections.map((section) => ({
    ...section,
    phases: section.phases.map((phase) => ({
      ...phase,
      relativeStart: recalculateRelativePosition(
        phase.relativeStart,
        oldStart,
        oldEnd,
        newStart,
        newEnd
      ),
      relativeEnd: recalculateRelativePosition(
        phase.relativeEnd,
        oldStart,
        oldEnd,
        newStart,
        newEnd
      ),
      // Elements are relative to their phase, so they don't need recalculation
    })),
    milestones: section.milestones.map((milestone) => ({
      ...milestone,
      relativePosition: recalculateRelativePosition(
        milestone.relativePosition,
        oldStart,
        oldEnd,
        newStart,
        newEnd
      ),
    })),
  }));
}

export function ProjectEditModal(): JSX.Element | null {
  const { editingProjectId, closeProjectEditModal } = useUIStore();
  const updateProject = useProjectStore((state) => state.updateProject);
  const setSections = useSectionStore((state) => state.setSections);

  const [formData, setFormData] = useState<ProjectFormData>({
    name: '',
    startDate: new Date(),
    endDate: new Date(),
  });

  const [originalDates, setOriginalDates] = useState<OriginalDates | null>(null);
  const [scaleTimeline, setScaleTimeline] = useState(true);

  // Initialize form when modal opens with current project data
  // Use getState() to avoid re-running when project changes
  useEffect(() => {
    if (editingProjectId) {
      const currentProject = useProjectStore.getState().project;
      const startDate = new Date(currentProject.startDate);
      const endDate = new Date(currentProject.endDate);
      setFormData({
        name: currentProject.name,
        startDate,
        endDate,
      });
      setOriginalDates({ startDate, endDate });
      setScaleTimeline(true);
    }
  }, [editingProjectId]);

  // Check if dates have changed
  const datesChanged = useMemo(() => {
    if (!originalDates) return false;
    return (
      formData.startDate.getTime() !== originalDates.startDate.getTime() ||
      formData.endDate.getTime() !== originalDates.endDate.getTime()
    );
  }, [formData.startDate, formData.endDate, originalDates]);

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

  const handleScaleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setScaleTimeline(e.target.checked);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const name = formData.name.trim() || 'Untitled Project';
      const newStartDate = formData.startDate.toISOString();
      const newEndDate = formData.endDate.toISOString();

      // If dates changed and user wants to keep existing dates (not scale)
      if (datesChanged && !scaleTimeline && originalDates) {
        const sections = useSectionStore.getState().sections;

        const updatedSections = recalculateSectionPositions(
          sections,
          originalDates.startDate.getTime(),
          originalDates.endDate.getTime(),
          formData.startDate.getTime(),
          formData.endDate.getTime()
        );

        // Update store with recalculated positions
        setSections(updatedSections);
      }

      // Update the project
      updateProject({ name, startDate: newStartDate, endDate: newEndDate });

      closeProjectEditModal();
    },
    [formData, datesChanged, scaleTimeline, originalDates, updateProject, setSections, closeProjectEditModal]
  );

  if (!editingProjectId) {
    return null;
  }

  const isValid = formData.startDate < formData.endDate;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-edit-title"
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
          <h2 className="text-base font-semibold text-[#111827]" id="project-edit-title">
            Edit Project
          </h2>
          <button
            onClick={closeProjectEditModal}
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

            {/* Scale timeline option - only show when dates have changed */}
            {datesChanged && (
              <label className="flex items-start gap-3 pt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scaleTimeline}
                  onChange={handleScaleChange}
                  className="mt-0.5 w-4 h-4 text-[#6b7280] border-[#d1d5db] rounded focus:ring-[#6b7280] focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm text-[#374151]">Scale timeline to new dates</span>
                  <p className="text-xs text-[#9ca3af] mt-0.5">
                    {scaleTimeline
                      ? 'Timeline items will stretch or shrink to fit the new duration'
                      : 'Timeline items will keep their original dates (items outside the new range will be clamped)'}
                  </p>
                </div>
              </label>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#e5e7eb]">
            <Button type="button" variant="secondary" onClick={closeProjectEditModal}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!isValid}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
