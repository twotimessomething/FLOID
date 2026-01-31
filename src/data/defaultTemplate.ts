import { addMonths } from 'date-fns';
import type { Project, Phase, Milestone } from '../types';
import { DEFAULT_PHASES, DEFAULT_MILESTONES } from '../constants/designProcess';

const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

export const createDefaultProject = (): Project => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start of current month
  const endDate = addMonths(startDate, 12); // 12 month project

  return {
    id: generateId(),
    name: 'Product Development',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
};

export const createDefaultPhases = (): Phase[] => {
  return DEFAULT_PHASES.map((phaseTemplate) => {
    const phaseId = generateId();

    const elements = phaseTemplate.elements.map((element) => ({
      ...element,
      id: generateId(),
      phaseId,
    }));

    return {
      ...phaseTemplate,
      id: phaseId,
      elements,
    };
  });
};

export const createDefaultMilestones = (): Milestone[] => {
  return DEFAULT_MILESTONES.map((milestoneTemplate) => ({
    ...milestoneTemplate,
    id: generateId(),
  }));
};
