import type { ScheduleTemplate } from './types';

export const blankTemplate: ScheduleTemplate = {
  id: 'blank',
  name: 'Blank Schedule',
  description: 'Start with an empty timeline',
  icon: 'plus',
  category: 'core',
  defaultColor: '#6A6A70', // Neutral
  phases: [],
  milestones: [],
};
