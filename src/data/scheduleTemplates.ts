import type { Section } from '../types';
import { getScheduleColor } from '../constants/colors';

// Re-export types and individual templates
export type {
  ScheduleTemplate,
  TemplatePhase,
  TemplateMilestone,
  TemplateTask,
  ProjectTemplate,
  ProjectTemplateSection,
} from './templates';
export {
  industrialDesignTemplate,
  engineeringTemplate,
  marketingTemplate,
  softwareTemplate,
  pdpTemplate,
  blankTemplate,
  completeProductDevelopmentTemplate,
  // Aligned templates
  pdpAlignedTemplate,
  industrialDesignAlignedTemplate,
  engineeringAlignedTemplate,
  softwareAlignedTemplate,
  marketingAlignedTemplate,
} from './templates';

// Import templates for aggregation
import {
  industrialDesignTemplate,
  engineeringTemplate,
  marketingTemplate,
  softwareTemplate,
  pdpTemplate,
  blankTemplate,
  completeProductDevelopmentTemplate,
  // Aligned templates
  pdpAlignedTemplate,
  industrialDesignAlignedTemplate,
  engineeringAlignedTemplate,
  softwareAlignedTemplate,
  marketingAlignedTemplate,
} from './templates';
import type { ScheduleTemplate, ProjectTemplate } from './templates';

import { generateId } from '../utils/idUtils';
import { createDefaultSectionDateRange } from '../utils/dateRangeUtils';
import { migrateLegacySection } from '../utils/migrateLegacy';

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
 * Aligned templates for Complete Product Development.
 * These templates have phases aligned to PDP stage-gate milestones.
 */
export const ALIGNED_TEMPLATES: readonly ScheduleTemplate[] = [
  pdpAlignedTemplate,
  industrialDesignAlignedTemplate,
  engineeringAlignedTemplate,
  softwareAlignedTemplate,
  marketingAlignedTemplate,
];

/**
 * All templates combined (regular + aligned).
 */
const ALL_TEMPLATES: readonly ScheduleTemplate[] = [...SCHEDULE_TEMPLATES, ...ALIGNED_TEMPLATES];

/**
 * Get a template by its ID.
 */
export function getTemplateById(templateId: string): ScheduleTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Get templates filtered by category.
 */
export function getTemplatesByCategory(category: ScheduleTemplate['category']): readonly ScheduleTemplate[] {
  return SCHEDULE_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Instantiate a template into a schedule.
 *
 * Templates describe positions as 0-1 fractions of whatever window they are
 * dropped into — the same description saved projects used before items carried
 * absolute dates. Both therefore need the same resolution step, and both run it
 * through `migrateLegacySection` so a fraction turns into a date in exactly one
 * place and the two can never drift apart.
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
  const { startDate, endDate } = options?.dateRange ?? createDefaultSectionDateRange();

  return migrateLegacySection({
    id: generateId(),
    type: 'schedule',
    name: options?.nameOverride ?? template.name,
    templateId: template.id,
    revision: 1,
    lastModifiedAt: new Date().toISOString(),
    color:
      options?.colorOverride ??
      (sectionIndex === 0 ? template.defaultColor : getScheduleColor(sectionIndex - 1)),
    // Templates with per-phase colors use the multicolor palette
    isMulticolor: template.phases.some((p) => p.color != null),
    order: sectionIndex,
    isCollapsed: false,
    startDate,
    endDate,
    phases: template.phases.map((phase) => ({
      ...phase,
      id: generateId(),
      tasks: phase.tasks.map((task) => ({ ...task, id: generateId() })),
    })),
    milestones: template.milestones.map((milestone) => ({
      ...milestone,
      id: generateId(),
    })),
  });
}

/**
 * Aggregated list of all project templates.
 */
export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [completeProductDevelopmentTemplate];

/**
 * Get a project template by its ID.
 */
export function getProjectTemplateById(templateId: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.id === templateId);
}

/**
 * Create multiple sections from a project template.
 * Returns sections along with the section to pin to the top.
 */
export function createSectionsFromProjectTemplate(
  projectTemplate: ProjectTemplate,
  options: {
    dateRange: { startDate: string; endDate: string };
  }
): { sections: Section[]; pinnedSectionId: string } {
  const sections: Section[] = [];
  let pinnedSectionId = '';

  for (const sectionDef of projectTemplate.sections) {
    const template = getTemplateById(sectionDef.templateId);
    if (!template) {
      console.warn(`Template not found: ${sectionDef.templateId}`);
      continue;
    }

    const section = createSectionFromTemplate(template, sectionDef.order, {
      dateRange: options.dateRange,
      colorOverride: template.defaultColor,
      nameOverride: sectionDef.nameOverride,
    });

    sections.push(section);

    if (sectionDef.isPinned) {
      pinnedSectionId = section.id;
    }
  }

  // Sort by order
  sections.sort((a, b) => a.order - b.order);

  return { sections, pinnedSectionId };
}
