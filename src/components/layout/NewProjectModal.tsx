import { useState, useCallback, useEffect, useMemo } from 'react';
import { addMonths } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore, type NewProjectConfig } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { SCHEDULE_TEMPLATES, type ScheduleTemplate } from '../../data/scheduleTemplates';
import { Button, Input, DateInput } from '../common';
import { TemplateIcon } from '../common/TemplateIcon';
import { usePresence } from '../../hooks/usePresence';

type Step = 'details' | 'template';

interface ProjectFormData {
  name: string;
  startDate: Date;
  endDate: Date;
  templateId: string;
}

const getDefaultFormData = (): ProjectFormData => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = addMonths(startDate, 12);
  return {
    name: '',
    startDate,
    endDate,
    templateId: 'id-timeline',
  };
};

interface TemplateOptionProps {
  readonly template: ScheduleTemplate;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

/**
 * A template reads as a row on the sheet, not a card. The chosen one takes the
 * selection ground and an ink outline — the same pair the timeline uses for a
 * selected row and a selected bar — and its name and glyph step up to full ink.
 */
function TemplateOption({ template, isSelected, onSelect }: TemplateOptionProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`group row-selectable focus-ring flex w-full items-start gap-3 px-2 py-2 text-left ${
        isSelected ? 'selected shadow-[inset_0_0_0_1.5px_var(--color-text-primary)]' : ''
      }`}
    >
      <TemplateIcon
        icon={template.icon}
        className={`w-4 h-4 mt-px flex-shrink-0 ${
          isSelected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'
        }`}
      />
      <span className="min-w-0">
        <span
          className={`block text-body ${
            isSelected
              ? 'text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]'
          }`}
        >
          {template.name}
        </span>
        <span className="block text-meta text-[var(--color-text-muted)]">
          {template.description}
        </span>
      </span>
    </button>
  );
}

export function NewProjectModal(): JSX.Element | null {
  const { isProjectSetupModalOpen, closeProjectSetupModal, closeModal } = useUIStore();
  const { createProject, selectProject, saveCurrentProject } = useProjectStore();
  const { sections, setSections } = useSectionStore();

  const [step, setStep] = useState<Step>('details');
  const [formData, setFormData] = useState<ProjectFormData>(getDefaultFormData);

  // Filter templates for the first schedule (core + team, not blank unless explicitly selected)
  const availableTemplates = useMemo(() => {
    return SCHEDULE_TEMPLATES.filter((t) => t.category === 'core' || t.category === 'team');
  }, []);

  // Reset form when modal opens
  useEffect(() => {
    if (isProjectSetupModalOpen) {
      setFormData(getDefaultFormData());
      setStep('details');
    }
  }, [isProjectSetupModalOpen]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
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
      const newEndDate = prev.endDate < date ? addMonths(date, 12) : prev.endDate;
      return { ...prev, startDate: date, endDate: newEndDate };
    });
  }, []);

  const handleEndDateChange = useCallback((date: Date) => {
    setFormData((prev) => ({ ...prev, endDate: date }));
  }, []);

  const handleTemplateSelect = useCallback((templateId: string) => {
    setFormData((prev) => ({ ...prev, templateId }));
  }, []);

  const handleNext = useCallback(() => {
    if (step === 'details') {
      setStep('template');
    }
  }, [step]);

  const handleBack = useCallback(() => {
    if (step === 'template') {
      setStep('details');
    }
  }, [step]);

  const isDetailsValid = formData.startDate < formData.endDate;

  const handleSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();

      // On details step, just advance to template step
      if (step === 'details') {
        if (isDetailsValid) {
          setStep('template');
        }
        return;
      }

      // Save current project before creating new one
      await saveCurrentProject(sections);

      const config: NewProjectConfig = {
        name: formData.name.trim() || 'New Project',
        startDate: formData.startDate,
        endDate: formData.endDate,
        templateId: formData.templateId,
      };

      // Create the new project with selected template
      const { projectId, sections: newSections } = await createProject(config);

      // Clear selection and switch to new project
      closeModal();
      await selectProject(projectId);
      setSections(newSections);

      closeProjectSetupModal();
    },
    [
      step,
      isDetailsValid,
      formData,
      sections,
      saveCurrentProject,
      createProject,
      selectProject,
      setSections,
      closeModal,
      closeProjectSetupModal,
    ]
  );

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(isProjectSetupModalOpen);
  if (!isMounted) return null;

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-setup-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/25" />

      {/* Modal */}
      <div
        className="relative bg-[var(--color-raised)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-lg mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-[var(--color-text-primary)]" id="project-setup-title">
              New Project
            </h2>
            {/* Step indicator */}
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${step === 'details' ? 'bg-[var(--color-text-primary)]' : 'bg-[var(--color-border)]'}`} />
              <div className={`w-1.5 h-1.5 rounded-full ${step === 'template' ? 'bg-[var(--color-text-primary)]' : 'bg-[var(--color-border)]'}`} />
            </div>
          </div>
          <button
            onClick={closeProjectSetupModal}
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

        {/* Content */}
        <form onSubmit={handleSubmit}>
          {step === 'details' && (
            <div className="p-6">
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

                {/* Duration info */}
                <div>
                  <p className="text-meta text-[var(--color-text-muted)]">
                    Project duration: {Math.ceil((formData.endDate.getTime() - formData.startDate.getTime()) / (1000 * 60 * 60 * 24))} days
                  </p>
                  <p className="text-meta text-[var(--color-text-muted)] mt-1">
                    Sets the starting window — each schedule keeps its own dates and can be changed later.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="secondary" onClick={closeProjectSetupModal}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleNext}
                  disabled={!isDetailsValid}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 'template' && (
            <div className="p-6">
              <div className="mb-4">
                <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
                  Choose a Starting Schedule
                </h3>
                <p className="text-meta text-[var(--color-text-muted)] mt-1">
                  Your first schedule, pinned to the top. Add more schedules anytime.
                </p>
              </div>

              {/* Template list. The rows bleed past the body's padding so the
                  selection ground has room to sit behind the text. */}
              <div className="-mx-2 max-h-80 overflow-y-auto">
                {availableTemplates.map((template) => (
                  <TemplateOption
                    key={template.id}
                    template={template}
                    isSelected={formData.templateId === template.id}
                    onSelect={() => handleTemplateSelect(template.id)}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex justify-between gap-3 mt-6">
                <Button type="button" variant="secondary" onClick={handleBack}>
                  Back
                </Button>
                <Button type="submit" variant="primary">
                  Create Project
                </Button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
