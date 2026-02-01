import type { Phase, Milestone, Section } from './timeline';

// Extended phase with computed absolute dates for export
export interface ExportPhase extends Phase {
  absoluteStart: string; // ISO date string
  absoluteEnd: string;
}

// Extended milestone with computed absolute date for export
export interface ExportMilestone extends Milestone {
  absoluteDate: string; // ISO date string
}

export interface ScheduleExportData {
  format: 'floid';
  version: '2.0';
  exportedAt: string;

  // Source tracking
  sourceProjectId: string;
  sourceProjectName: string;

  // Schedule metadata
  schedule: {
    id: string;
    name: string;
    templateId?: string;
    revision: number;
    lastModifiedAt: string;
    bindingMode: 'locked' | 'independent';
    color: string;
  };

  // Date context (for import decisions)
  projectDates: {
    startDate: string;
    endDate: string;
  };
  scheduleDates: {
    startDate: string;
    endDate: string;
  };

  // Content (absolute dates for portability)
  phases: ExportPhase[];
  milestones: ExportMilestone[];
}

export type ImportResultType =
  | 'new-schedule'    // New schedule to add
  | 'update-newer'    // Existing schedule, import is newer revision
  | 'update-older'    // Existing schedule, import is older revision
  | 'update-same'     // Existing schedule, same revision
  | 'name-collision'; // Same name but different ID

export interface ImportAnalysis {
  type: ImportResultType;
  existingSection?: Section;
  importData: ScheduleExportData;
  dateMismatch: boolean;
  revisionDelta?: number;  // positive = import is newer
}

export interface ImportOptions {
  rescaleToMaster: boolean;
  newName?: string;  // For name collision resolution
}

export type ImportModalType = 'new-schedule' | 'update' | 'name-collision';

export interface ImportModalState {
  isOpen: boolean;
  type: ImportModalType | null;
  analysis: ImportAnalysis | null;
}

// Full project export format
export interface ProjectExportData {
  format: 'floid-project';
  version: '2.0';
  exportedAt: string;
  project: {
    id: string;
    name: string;
    masterSectionId: string;
    projectStartDate: string;
    projectEndDate: string;
    createdAt: string;
    updatedAt: string;
  };
  sections: Array<{
    id: string;
    name: string;
    type: 'schedule';
    templateId?: string;
    bindingMode: 'locked' | 'independent';
    revision: number;
    lastModifiedAt: string;
    sourceProjectId?: string;
    sourceProjectName?: string;
    order: number;
    startDate: string;
    endDate: string;
    color: string;
    isCollapsed: boolean;
    phases: ExportPhase[];
    milestones: ExportMilestone[];
  }>;
}
