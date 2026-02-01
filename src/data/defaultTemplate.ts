import { addMonths } from 'date-fns';
import type { Project, Section } from '../types';
import { getTemplateById, createSectionFromTemplate } from './scheduleTemplates';

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

/**
 * Create default section date range: 1st of current month to 12 months later.
 */
export const createDefaultSectionDateRange = (): { startDate: string; endDate: string } => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = addMonths(startDate, 12);
  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};

export const createDefaultProject = (masterSectionId: string, startDate: string, endDate: string): Project => {
  const now = new Date();

  return {
    id: generateId(),
    name: 'Product Development',
    masterSectionId,
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
