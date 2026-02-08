import type { Section, Phase, Milestone } from '../types';
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

    const tasks = phaseTemplate.tasks.map((task) => ({
      id: generateId(),
      phaseId,
      name: task.name,
      description: task.description,
      relativeStart: task.relativeStart,
      relativeEnd: task.relativeEnd,
      order: task.order,
    }));

    return {
      id: phaseId,
      sectionId,
      name: phaseTemplate.name,
      description: phaseTemplate.description,
      color: phaseTemplate.color ?? null,
      order: phaseTemplate.order,
      isCollapsed: false,
      tasks,
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
 * Returns sections with the master section first.
 */
export function createSectionsFromProjectTemplate(
  projectTemplate: ProjectTemplate,
  options: {
    dateRange: { startDate: string; endDate: string };
  }
): { sections: Section[]; masterSectionId: string } {
  const sections: Section[] = [];
  let masterSectionId = '';

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

    if (sectionDef.isMaster) {
      masterSectionId = section.id;
    }
  }

  // Sort by order
  sections.sort((a, b) => a.order - b.order);

  return { sections, masterSectionId };
}
