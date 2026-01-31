// Section = container for phases (unified ID timeline + Team)
export interface Section {
  id: string;
  type: 'id-timeline' | 'team';
  name: string;
  color: string;
  order: number;
  isCollapsed: boolean;
  phases: Phase[];
  milestones: Milestone[];
}

// Phase = time segment within a section
export interface Phase {
  id: string;
  sectionId: string;
  name: string;
  description: string;
  color: string | null; // null = inherit from section (teams), string = custom (ID timeline)
  order: number;
  isCollapsed: boolean;
  elements: Element[];
  relativeStart: number;
  relativeEnd: number;
}

// Element = item within phase
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

// Milestone = single-point marker on timeline
export interface Milestone {
  id: string;
  sectionId: string;
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

// Enhanced selection with parent context for O(1) lookups
export interface SelectionState {
  type: 'section' | 'phase' | 'element' | 'milestone' | null;
  id: string | null;
  sectionId: string | null; // Always present for lookups
  phaseId: string | null; // Present for elements
  position?: ModalPosition;
}

// ID for the special ID timeline section (never changes)
export const ID_TIMELINE_SECTION_ID = 'id-timeline';

// Helper to get effective color for a phase
export function getPhaseColor(phase: Phase, section: Section): string {
  return phase.color ?? section.color;
}
