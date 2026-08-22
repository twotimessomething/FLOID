import type { ScheduleTemplate } from './types';

export const blankTemplate: ScheduleTemplate = {
  id: 'blank',
  name: 'Blank Schedule',
  description: 'Start with an empty timeline',
  icon: 'plus',
  category: 'core',
  defaultColor: '#5BB5A9', // Teal
  phases: [],
  milestones: [],
};
