export interface Phase {
  id: string;
  name: string;
  description: string;
  color: string;
  order: number;
  isCollapsed: boolean;
  elements: Element[];
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
  name: string;
  description: string;
  relativePosition: number; // 0-1 within full project timeline
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
