import { useCallback, useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useSectionStore } from '../../stores/sectionStore';
import { TEAM_TEMPLATES, createSectionFromTemplate } from '../../data/teamTemplates';
import type { TeamTemplate } from '../../data/teamTemplates';

function TemplateIcon({ icon }: { readonly icon: TeamTemplate['icon'] }): JSX.Element {
  switch (icon) {
    case 'cog':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      );
    case 'megaphone':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
          />
        </svg>
      );
    case 'code':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
      );
    case 'clipboard':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      );
    case 'blank':
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 4v16m8-8H4"
          />
        </svg>
      );
  }
}

interface TemplateCardProps {
  readonly template: TeamTemplate;
  readonly onSelect: (template: TeamTemplate) => void;
}

function TemplateCard({ template, onSelect }: TemplateCardProps): JSX.Element {
  const handleClick = useCallback(() => {
    onSelect(template);
  }, [template, onSelect]);

  return (
    <button
      onClick={handleClick}
      className="flex flex-col items-start p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)] hover:shadow-sm transition-all duration-150 text-left focus-ring btn-press"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--color-hover)] text-[var(--color-text-secondary)] mb-3">
        <TemplateIcon icon={template.icon} />
      </div>
      <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-1">{template.name}</h3>
      <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{template.description}</p>
    </button>
  );
}

export function AddTeamModal(): JSX.Element | null {
  const { isAddTeamModalOpen, closeAddTeamModal } = useUIStore();
  const sections = useSectionStore((state) => state.sections);
  const setSections = useSectionStore((state) => state.setSections);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeAddTeamModal();
      }
    },
    [closeAddTeamModal]
  );

  const handleSelectTemplate = useCallback(
    (template: TeamTemplate) => {
      const teamCount = sections.filter((s) => s.type === 'team').length;
      const newSection = createSectionFromTemplate(template, teamCount);
      setSections([...sections, newSection]);
      closeAddTeamModal();
    },
    [sections, setSections, closeAddTeamModal]
  );

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeAddTeamModal();
      }
    };

    if (isAddTeamModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isAddTeamModalOpen, closeAddTeamModal]);

  if (!isAddTeamModalOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-team-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* Modal */}
      <div
        className="relative glass-bordered rounded-xl w-full max-w-lg mx-4 modal-enter"
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]" id="add-team-title">
            Add Team
          </h2>
          <button
            onClick={closeAddTeamModal}
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

        {/* Body */}
        <div className="p-6">
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Choose a template to pre-populate phases and milestones.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {TEAM_TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={handleSelectTemplate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
