import { addMonths } from 'date-fns';
import type { Section, Phase, Milestone } from '../types';
import { getScheduleColor } from '../constants/colors';

// Re-export types and individual templates
export type { ScheduleTemplate, TemplatePhase, TemplateMilestone, TemplateElement } from './templates';
export {
  industrialDesignTemplate,
  engineeringTemplate,
  marketingTemplate,
  softwareTemplate,
  pdpTemplate,
  blankTemplate,
} from './templates';

// Import templates for aggregation
import {
  industrialDesignTemplate,
  engineeringTemplate,
  marketingTemplate,
  softwareTemplate,
  pdpTemplate,
  blankTemplate,
} from './templates';
import type { ScheduleTemplate } from './templates';

/**
 * Create default section date range: 1st of current month to 12 months later.
 */
const createDefaultSectionDateRange = (): { startDate: string; endDate: string } => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = addMonths(startDate, 12);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

/**
 * Aggregated list of all schedule templates.
 * Add new templates to the templates/ directory and import them here.
 */
export const SCHEDULE_TEMPLATES: readonly ScheduleTemplate[] = [
  industrialDesignTemplate,
  engineeringTemplate,
  marketingTemplate,
  softwareTemplate,
  pdpTemplate,
  blankTemplate,
];

/**
 * Get a template by its ID.
 */
export function getTemplateById(templateId: string): ScheduleTemplate | undefined {
  return SCHEDULE_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Get templates filtered by category.
 */
export function getTemplatesByCategory(category: ScheduleTemplate['category']): readonly ScheduleTemplate[] {
  return SCHEDULE_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get templates suggested as master schedules.
 */
export function getMasterSuggestedTemplates(): readonly ScheduleTemplate[] {
  return SCHEDULE_TEMPLATES.filter((t) => t.suggestedAsMaster);
}

/**
 * Create a section from a template.
 */
export function createSectionFromTemplate(
  template: ScheduleTemplate,
  sectionIndex: number,
  options?: {
    dateRange?: { startDate: string; endDate: string };
    colorOverride?: string;
    nameOverride?: string;
  }
): Section {
  const sectionId = generateId();
  const { startDate, endDate } = options?.dateRange ?? createDefaultSectionDateRange();
  const now = new Date().toISOString();

  const phases: Phase[] = template.phases.map((phaseTemplate) => {
    const phaseId = generateId();

    const elements = phaseTemplate.elements.map((element) => ({
      id: generateId(),
      phaseId,
      name: element.name,
      description: element.description,
      relativeStart: element.relativeStart,
      relativeEnd: element.relativeEnd,
      order: element.order,
    }));

    return {
      id: phaseId,
      sectionId,
      name: phaseTemplate.name,
      description: phaseTemplate.description,
      color: phaseTemplate.color ?? null,
      order: phaseTemplate.order,
      isCollapsed: false,
      elements,
      relativeStart: phaseTemplate.relativeStart,
      relativeEnd: phaseTemplate.relativeEnd,
    };
  });

  const milestones: Milestone[] = template.milestones.map((milestoneTemplate) => ({
    id: generateId(),
    sectionId,
    name: milestoneTemplate.name,
    description: milestoneTemplate.description,
    relativePosition: milestoneTemplate.relativePosition,
    order: milestoneTemplate.order,
  }));

  return {
    id: sectionId,
    type: 'schedule',
    name: options?.nameOverride ?? template.name,
    templateId: template.id,
    revision: 1,
    lastModifiedAt: now,
    color: options?.colorOverride ?? (sectionIndex === 0 ? template.defaultColor : getScheduleColor(sectionIndex - 1)),
    order: sectionIndex,
    isCollapsed: false,
    phases,
    milestones,
    startDate,
    endDate,
  };
}
