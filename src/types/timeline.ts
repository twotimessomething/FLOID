export interface Phase {
  id: string;
  name: string;
  description: string;
  color: string;
  order: number;
  isCollapsed: boolean;
  elements: Element[];
  milestones: Milestone[];
  // Relative positioning (0-1 scale within project)
  relativeStart: number;
  relativeEnd: number;
}

export interface Element {
  id: string;
  phaseId: string;
  name: string;
  description: string;
  // Relative positioning (0-1 scale within parent phase)
  relativeStart: number;
  relativeEnd: number;
  order: number;
}

export interface Milestone {
  id: string;
  parentId: string; // phaseId or teamPhaseId
  parentType: 'phase' | 'teamPhase';
  name: string;
  description: string;
  relativePosition: number; // 0-1 within parent
  order: number;
}

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

export interface ModalPosition {
  x: number;
  y: number;
}

export interface SelectionState {
  type: 'phase' | 'element' | 'milestone' | 'team' | 'teamPhase' | 'teamElement' | null;
  id: string | null;
  position?: ModalPosition;
}
