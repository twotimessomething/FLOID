// Types
export type {
  TemplateTask,
  TemplatePhase,
  TemplateMilestone,
  ScheduleTemplate,
} from './types';

export type { ProjectTemplate, ProjectTemplateSection } from './projectTemplates';

// Individual templates
export { industrialDesignTemplate } from './industrialDesign';
export { engineeringTemplate } from './engineering';
export { marketingTemplate } from './marketing';
export { softwareTemplate } from './software';
export { pdpTemplate } from './pdp';
export { blankTemplate } from './blank';

// Aligned templates (for Complete Product Development)
export {
  pdpAlignedTemplate,
  industrialDesignAlignedTemplate,
  engineeringAlignedTemplate,
  softwareAlignedTemplate,
  marketingAlignedTemplate,
} from './aligned';

// Project templates
export { completeProductDevelopmentTemplate } from './completeProductDevelopment';
