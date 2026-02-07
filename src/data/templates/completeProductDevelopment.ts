import type { ProjectTemplate } from './projectTemplates';

/**
 * Complete Product Development template.
 * Uses aligned templates that sync to PDP stage-gate milestones.
 * PDP is the master schedule that drives all dates.
 */
export const completeProductDevelopmentTemplate: ProjectTemplate = {
  id: 'complete-product-development',
  name: 'Complete Product Development',
  description:
    'Full cross-functional timeline with PDP, ID, Engineering, Software, and Marketing - all aligned to stage-gates',
  icon: 'rocket',
  category: 'featured',
  featured: true,
  sections: [
    { templateId: 'pdp-aligned', order: 0, isMaster: true },
    { templateId: 'id-timeline-aligned', order: 1, isMaster: false },
    { templateId: 'engineering-aligned', order: 2, isMaster: false },
    { templateId: 'software-aligned', order: 3, isMaster: false },
    { templateId: 'marketing-aligned', order: 4, isMaster: false },
  ],
};
