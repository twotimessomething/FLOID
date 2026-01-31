import type { Milestone } from './timeline';

export interface Team {
  id: string;
  name: string;
  color: string;
  order: number;
  isCollapsed: boolean;
  phases: TeamPhase[];
}

export interface TeamPhase {
  id: string;
  teamId: string;
  name: string;
  description: string;
  relativeStart: number;
  relativeEnd: number;
  order: number;
  isCollapsed: boolean;
  elements: TeamElement[];
  milestones: Milestone[];
}

export interface TeamElement {
  id: string;
  teamPhaseId: string;
  name: string;
  description: string;
  relativeStart: number;
  relativeEnd: number;
  order: number;
}
