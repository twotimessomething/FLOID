// Section = container for phases (unified schedule type)
export interface Section {
  id: string;
  name: string;
  type: 'schedule';             // Unified type - no more 'id-timeline' | 'team' distinction
  templateId?: string;          // Which template this was created from
  revision: number;             // Incrementing version for sync
  lastModifiedAt: string;       // ISO timestamp
  sourceProjectId?: string;     // If imported, where it came from
  sourceProjectName?: string;   // For display purposes
  order: number;
  startDate: string;            // ISO date string
  endDate: string;              // ISO date string
  phases: Phase[];
  milestones: Milestone[];
  color: string;
  isCollapsed: boolean;
}

// Computed viewport bounds derived from all sections
export interface ViewportBounds {
  startDate: Date;
  endDate: Date;
  totalDays: number;
}

// Phase = time segment within a section
export interface Phase {
  id: string;
  sectionId: string;
  name: string;
  description: string;
  color: string | null; // null = inherit from section
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
  relativePosition: number; // 0-1 within section timeline
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

// Helper to get effective color for a phase
export function getPhaseColor(phase: Phase, section: Section): string {
  return phase.color ?? section.color;
}
