import type { Project, Section } from '../types';
import { getTemplateById, createSectionFromTemplate } from './scheduleTemplates';
import { generateId } from '../utils/idUtils';
import { createDefaultSectionDateRange } from '../utils/dateRangeUtils';

export { createDefaultSectionDateRange } from '../utils/dateRangeUtils';

export const createDefaultProject = (pinnedSectionId: string, startDate: string, endDate: string): Project => {
  const now = new Date();

  return {
    id: generateId(),
    name: 'Product Development',
    pinnedSectionId,
    projectStartDate: startDate,
    projectEndDate: endDate,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
};

/**
 * Create the default ID Timeline section using the schedule template system.
 */
export const createDefaultIDTimelineSection = (): Section => {
  const idTemplate = getTemplateById('id-timeline');
  if (!idTemplate) {
    throw new Error('ID Timeline template not found');
  }

  const { startDate, endDate } = createDefaultSectionDateRange();

  return createSectionFromTemplate(idTemplate, 0, {
    dateRange: { startDate, endDate },
  });
};
