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
  barMilestones?: BarMilestone[]; // Optional - defaults to empty array
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

// Bar milestone = simple label marker on a phase or element bar
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
  type: 'section' | 'phase' | 'element' | 'milestone' | 'barMilestone' | null;
  id: string | null;
  sectionId: string | null; // Always present for lookups
  phaseId: string | null; // Present for elements and bar milestones
  elementId?: string | null; // Present for bar milestones on elements
  position?: ModalPosition;
}

// Helper to get effective color for a phase
// When phaseIndex and totalPhases are provided, computes a gradient color
export function getPhaseColor(
  phase: Phase,
  section: Section,
  phaseIndex?: number,
  totalPhases?: number
): string {
  // If phase has explicit color, use it
  if (phase.color) {
    return phase.color;
  }

  // If index info provided, compute gradient color
  // Import dynamically to avoid circular dependency
  if (phaseIndex !== undefined && totalPhases !== undefined && totalPhases > 1) {
    // Inline the color computation to avoid import issues
    // This mirrors getPhaseColorInRange from colorUtils
    const HUE_SHIFT = 15;
    const LIGHTNESS_SHIFT = -12;

    const hex = section.color.replace(/^#/, '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    let h = 0;
    let s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    const baseH = h * 360;
    const baseS = s * 100;
    const baseL = l * 100;

    const t = phaseIndex / (totalPhases - 1);
    const newH = ((baseH + HUE_SHIFT * t) % 360 + 360) % 360;
    const newS = baseS;
    const newL = Math.max(0, Math.min(100, baseL + LIGHTNESS_SHIFT * t));

    // HSL to hex
    const sNorm = newS / 100;
    const lNorm = newL / 100;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((newH / 60) % 2) - 1));
    const m = lNorm - c / 2;

    let rOut = 0, gOut = 0, bOut = 0;
    if (newH < 60) { rOut = c; gOut = x; }
    else if (newH < 120) { rOut = x; gOut = c; }
    else if (newH < 180) { gOut = c; bOut = x; }
    else if (newH < 240) { gOut = x; bOut = c; }
    else if (newH < 300) { rOut = x; bOut = c; }
    else { rOut = c; bOut = x; }

    const toHex = (v: number): string => {
      const hex = Math.round((v + m) * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(rOut)}${toHex(gOut)}${toHex(bOut)}`;
  }

  // Fallback to section color
  return section.color;
}
