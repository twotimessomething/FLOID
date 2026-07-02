import type { ProjectTemplate } from './projectTemplates';

/**
 * Complete Product Development template.
 * Uses aligned templates that share PDP stage-gate milestones.
 * PDP is pinned to the top of the timeline.
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
    { templateId: 'pdp-aligned', order: 0, isPinned: true },
    { templateId: 'id-timeline-aligned', order: 1, isPinned: false },
    { templateId: 'engineering-aligned', order: 2, isPinned: false },
    { templateId: 'software-aligned', order: 3, isPinned: false },
    { templateId: 'marketing-aligned', order: 4, isPinned: false },
  ],
};
