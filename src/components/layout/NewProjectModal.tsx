import { useState, useCallback, useEffect, useMemo } from 'react';
import { addMonths } from 'date-fns';
import { useUIStore } from '../../stores/uiStore';
import { useProjectStore, type NewProjectConfig } from '../../stores/projectStore';
import { useSectionStore } from '../../stores/sectionStore';
import { SCHEDULE_TEMPLATES, type ScheduleTemplate } from '../../data/scheduleTemplates';
import { Button, Input, DateInput } from '../common';

type Step = 'details' | 'template';

interface ProjectFormData {
  name: string;
  startDate: Date;
  endDate: Date;
  masterTemplateId: string;
}

const getDefaultFormData = (): ProjectFormData => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = addMonths(startDate, 12);
  return {
    name: '',
    startDate,
    endDate,
    masterTemplateId: 'id-timeline',
  };
};

// Template icon components
function TemplateIcon({ icon }: { readonly icon: ScheduleTemplate['icon'] }): JSX.Element {
  switch (icon) {
    case 'palette':
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
        </svg>
      );
    case 'cog':
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'megaphone':
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
        </svg>
      );
    case 'code':
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
      );
    case 'plus':
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      );
    default:
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      );
  }
}

interface TemplateCardProps {
  readonly template: ScheduleTemplate;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}

function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative flex flex-col items-start p-4 rounded-lg border-2 transition-all duration-150 text-left w-full
        ${isSelected
          ? 'border-[var(--color-text-primary)] bg-[var(--color-hover)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)] hover:bg-[var(--color-hover)]'
        }
      `}
    >
      <div
        className="p-2 rounded-lg mb-2"
        style={{ backgroundColor: `${template.defaultColor}15`, color: template.defaultColor }}
      >
        <TemplateIcon icon={template.icon} />
      </div>
      <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{template.name}</h3>
      <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">{template.description}</p>
      {isSelected && (
        <div className="absolute bottom-2 right-2">
          <svg className="w-5 h-5 text-[var(--color-text-primary)]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </button>
  );
}

export function NewProjectModal(): JSX.Element | null {
  const { isProjectSetupModalOpen, closeProjectSetupModal, closeModal } = useUIStore();
  const { createProject, selectProject, saveCurrentProject } = useProjectStore();
  const { sections, setSections } = useSectionStore();

  const [step, setStep] = useState<Step>('details');
  const [formData, setFormData] = useState<ProjectFormData>(getDefaultFormData);

  // Filter templates for master schedule selection (core + team, not blank unless explicitly selected)
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
      const newEndDate = prev.endDate < date ? addMonths(date, 12) : prev.endDate;
      return { ...prev, startDate: date, endDate: newEndDate };
    });
  }, []);

  const handleEndDateChange = useCallback((date: Date) => {
    setFormData((prev) => ({ ...prev, endDate: date }));
  }, []);

  const handleTemplateSelect = useCallback((templateId: string) => {
    setFormData((prev) => ({ ...prev, masterTemplateId: templateId }));
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
    async (e: React.FormEvent) => {
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
        masterTemplateId: formData.masterTemplateId,
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

  if (!isProjectSetupModalOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-setup-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* Modal */}
      <div
        className="relative glass-bordered rounded-xl w-full max-w-lg mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-row-border-strong)]">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]" id="project-setup-title">
              New Project
            </h2>
            {/* Step indicator */}
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full transition-colors ${step === 'details' ? 'bg-[var(--color-text-primary)]' : 'bg-[var(--color-border)]'}`} />
              <div className={`w-2 h-2 rounded-full transition-colors ${step === 'template' ? 'bg-[var(--color-text-primary)]' : 'bg-[var(--color-border)]'}`} />
            </div>
          </div>
          <button
            onClick={closeProjectSetupModal}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 rounded-md hover:bg-[var(--color-hover)] focus-ring btn-press"
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
                <p className="text-xs text-[var(--color-text-muted)]">
                  Project duration: {Math.ceil((formData.endDate.getTime() - formData.startDate.getTime()) / (1000 * 60 * 60 * 24))} days
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[var(--color-border)]">
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
                  Choose Master Schedule
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  This will be the primary schedule that drives project dates.
                </p>
              </div>

              {/* Template Grid */}
              <div className="grid grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1">
                {availableTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    isSelected={formData.masterTemplateId === template.id}
                    onSelect={() => handleTemplateSelect(template.id)}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-[var(--color-border)]">
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
