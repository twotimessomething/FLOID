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
  isMulticolor?: boolean;       // Phases use the multicolor palette instead of the schedule color
  isCollapsed: boolean;
  isLocked?: boolean;           // Prevents moving/resizing all phases in this section
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
  isLocked?: boolean;   // Prevents moving/resizing this phase and its tasks
  tasks: Task[];
  barMilestones?: BarMilestone[]; // Optional - defaults to empty array
  relativeStart: number;
  relativeEnd: number;
}

// Task = item within phase
export interface Task {
  id: string;
  phaseId: string;
  name: string;
  description: string;
  // Relative positioning (0-1 scale within parent phase)
  relativeStart: number;
  relativeEnd: number;
  order: number;
  barMilestones?: BarMilestone[]; // Optional - defaults to empty array
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

// Bar milestone = simple label marker on a phase or task bar
export interface BarMilestone {
  id: string;
  name: string;
  relativePosition: number; // 0-1 within parent bar
}

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

export interface ModalPosition {
  x: number;
  y: number;
}

// Enhanced selection with parent context for O(1) lookups
export interface SelectionState {
  type: 'section' | 'phase' | 'task' | 'milestone' | 'barMilestone' | null;
  id: string | null;
  sectionId: string | null; // Always present for lookups
  phaseId: string | null; // Present for tasks and bar milestones
  taskId?: string | null; // Present for bar milestones on tasks
  position?: ModalPosition;
}

// Helper to get effective color for a phase
// When phaseIndex and totalPhases are provided, computes a gradient color
export { getPhaseColor } from './phaseColor';
