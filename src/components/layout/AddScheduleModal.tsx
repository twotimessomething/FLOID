import { useCallback, useEffect, useMemo } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useSectionStore } from '../../stores/sectionStore';
import { SCHEDULE_TEMPLATES, createSectionFromTemplate } from '../../data/scheduleTemplates';
import { getSectionsDateRange } from '../../utils/dateUtils';
import type { ScheduleTemplate } from '../../data/scheduleTemplates';
import { TemplateIcon } from '../common/TemplateIcon';
import { usePresence } from '../../hooks/usePresence';

interface TemplateOptionProps {
  readonly template: ScheduleTemplate;
  readonly onSelect: (template: ScheduleTemplate) => void;
}

/**
 * A template reads as a row on the sheet, not a card: a plain ink glyph, the
 * name, and what the template lays down. Hover is the only ground it takes,
 * from `.row-selectable` — the same one a timeline row uses.
 */
function TemplateOption({ template, onSelect }: TemplateOptionProps): JSX.Element {
  const handleClick = useCallback(() => {
    onSelect(template);
  }, [template, onSelect]);

  return (
    <button
      onClick={handleClick}
      className="group row-selectable focus-ring btn-press flex w-full items-start gap-3 px-2 py-2 text-left"
    >
      <TemplateIcon
        icon={template.icon}
        className="w-4 h-4 mt-px flex-shrink-0 text-[var(--color-text-muted)]"
      />
      <span className="min-w-0">
        <span className="block text-body text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]">
          {template.name}
        </span>
        <span className="block text-meta text-[var(--color-text-muted)]">
          {template.description}
        </span>
      </span>
    </button>
  );
}

export function AddScheduleModal(): JSX.Element | null {
  const { isAddScheduleModalOpen, closeAddScheduleModal } = useUIStore();
  const sections = useSectionStore((state) => state.sections);
  const setSections = useSectionStore((state) => state.setSections);

  // Align new schedules with the existing schedules' combined date range
  const defaultDateRange = useMemo(() => getSectionsDateRange(sections) ?? undefined, [sections]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeAddScheduleModal();
      }
    },
    [closeAddScheduleModal]
  );

  const handleSelectTemplate = useCallback(
    (template: ScheduleTemplate) => {
      // Use sections.length to determine order (new section goes at the end)
      const newSection = createSectionFromTemplate(template, sections.length, {
        dateRange: defaultDateRange,
      });
      setSections([...sections, newSection]);
      closeAddScheduleModal();
    },
    [sections, setSections, closeAddScheduleModal, defaultDateRange]
  );

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        closeAddScheduleModal();
      }
    };

    if (isAddScheduleModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isAddScheduleModalOpen, closeAddScheduleModal]);

  // Held on screen through the exit so the panel and its scrim can leave
  // together, the way they arrived.
  const { isMounted, isLeaving } = usePresence(isAddScheduleModalOpen);
  if (!isMounted) return null;

  return (
    <div
      className={`modal-layer fixed inset-0 z-50 flex items-center justify-center ${isLeaving ? 'is-leaving' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-schedule-title"
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
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]" id="add-schedule-title">
            Add Schedule
          </h2>
          <button
            onClick={closeAddScheduleModal}
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

        {/* Body */}
        <div className="p-6">
          <p className="text-body text-[var(--color-text-secondary)] mb-4">
            Choose a template to pre-populate phases and milestones.
          </p>
          {/* The rows bleed past the body's padding so the hover ground has
              room to sit behind the text. */}
          <div className="-mx-2">
            {SCHEDULE_TEMPLATES.filter((t) => t.category === 'team' || t.category === 'core').map((template) => (
              <TemplateOption
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
