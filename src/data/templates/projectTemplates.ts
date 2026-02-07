/**
 * Project template types for multi-section project creation.
 */

import type { ScheduleTemplate } from './types';

export interface ProjectTemplateSection {
  readonly templateId: string;
  readonly order: number;
  readonly isMaster: boolean;
  readonly nameOverride?: string;
}

export interface ProjectTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: 'rocket' | ScheduleTemplate['icon'];
  readonly category: 'featured' | 'core';
  readonly featured: boolean;
  readonly sections: readonly ProjectTemplateSection[];
}
