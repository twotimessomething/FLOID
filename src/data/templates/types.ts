/**
 * Template types for schedule definitions.
 */

export interface TemplateElement {
  readonly name: string;
  readonly description: string;
  readonly relativeStart: number;
  readonly relativeEnd: number;
  readonly order: number;
}

export interface TemplatePhase {
  readonly name: string;
  readonly description: string;
  readonly relativeStart: number;
  readonly relativeEnd: number;
  readonly order: number;
  readonly elements: readonly TemplateElement[];
  readonly color?: string;
}

export interface TemplateMilestone {
  readonly name: string;
  readonly description: string;
  readonly relativePosition: number;
  readonly order: number;
}

export interface ScheduleTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: 'palette' | 'cog' | 'megaphone' | 'code' | 'clipboard' | 'plus';
  readonly category: 'core' | 'team' | 'custom';
  readonly suggestedAsMaster: boolean;
  readonly defaultColor: string;
  readonly phases: readonly TemplatePhase[];
  readonly milestones: readonly TemplateMilestone[];
}
