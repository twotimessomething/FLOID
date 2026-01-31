import { addMonths } from 'date-fns';
import type { Project, Section, Phase, Milestone } from '../types';
import { ID_TIMELINE_SECTION_ID } from '../types';
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

export const createDefaultIDTimelineSection = (): Section => {
  const sectionId = ID_TIMELINE_SECTION_ID;

  const phases: Phase[] = DEFAULT_PHASES.map((phaseTemplate) => {
    const phaseId = generateId();

    const elements = phaseTemplate.elements.map((element) => ({
      ...element,
      id: generateId(),
      phaseId,
    }));

    return {
      id: phaseId,
      sectionId,
      name: phaseTemplate.name,
      description: phaseTemplate.description,
      color: phaseTemplate.color, // ID timeline phases have individual colors
      order: phaseTemplate.order,
      isCollapsed: phaseTemplate.isCollapsed,
      elements,
      relativeStart: phaseTemplate.relativeStart,
      relativeEnd: phaseTemplate.relativeEnd,
    };
  });

  const milestones: Milestone[] = DEFAULT_MILESTONES.map((milestoneTemplate) => ({
    ...milestoneTemplate,
    id: generateId(),
    sectionId,
  }));

  return {
    id: sectionId,
    type: 'id-timeline',
    name: 'Industrial Design',
    color: '#6366F1', // Indigo (default, though ID timeline uses per-phase colors)
    order: 0,
    isCollapsed: false,
    phases,
    milestones,
  };
};
