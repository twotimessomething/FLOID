import type { Milestone } from './timeline';

export interface Team {
  id: string;
  name: string;
  color: string;
  order: number;
  isCollapsed: boolean;
  phases: TeamPhase[];
  milestones: Milestone[]; // Team-level milestones (phase-agnostic)
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
