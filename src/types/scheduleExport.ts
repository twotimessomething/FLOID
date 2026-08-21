import type { Section, TimelineItem } from './timeline';

/**
 * The file formats: `.floid` for one schedule, `.floid-project` for the lot.
 *
 * Items already carry absolute dates, so an exported item is the runtime item
 * verbatim — nothing is resolved on the way out and nothing recomputed on the
 * way in. The tree is copied wholesale rather than rebuilt field by field,
 * which is the only way a file cannot quietly lose what the writer forgot to
 * list. Files written before the item model are migrated as they are read.
 */

/** An item on the wire. Identical to the runtime item, on purpose. */
export type ExportItem = TimelineItem;

export interface ScheduleExportData {
  readonly format: 'floid';
  readonly version: '3.0';
  readonly exportedAt: string;

  // Source tracking
  readonly sourceProjectId: string;
  readonly sourceProjectName: string;

  // Schedule metadata
  readonly schedule: {
    readonly id: string;
    readonly name: string;
    readonly templateId?: string;
    readonly revision: number;
    readonly lastModifiedAt: string;
    readonly color: string;
    readonly isMulticolor?: boolean;
    readonly isLocked?: boolean;
  };

  // Date context (for import decisions)
  readonly projectDates: {
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly scheduleDates: {
    readonly startDate: string;
    readonly endDate: string;
  };

  readonly items: readonly ExportItem[];
}

export type ImportResultType =
  | 'new-schedule'    // New schedule to add
  | 'update-newer'    // Existing schedule, import is newer revision
  | 'update-older'    // Existing schedule, import is older revision
  | 'update-same'     // Existing schedule, same revision
  | 'name-collision'; // Same name but different ID

export interface ImportAnalysis {
  readonly type: ImportResultType;
  readonly existingSection?: Section;
  readonly importData: ScheduleExportData;
  readonly dateMismatch: boolean;
  /** Positive when the import is newer than what is already here. */
  readonly revisionDelta?: number;
}

export interface ImportOptions {
  readonly newName?: string;  // For name collision resolution
}

export type ImportModalType = 'new-schedule' | 'update' | 'name-collision';

export interface ImportModalState {
  readonly isOpen: boolean;
  readonly type: ImportModalType | null;
  readonly analysis: ImportAnalysis | null;
}

/** Full project backup. Schedules are stored exactly as the app holds them. */
export interface ProjectExportData {
  readonly format: 'floid-project';
  readonly version: '3.0';
  readonly exportedAt: string;
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly pinnedSectionId: string | null;
    /** Legacy field from exports created before the pin model. */
    readonly masterSectionId?: string;
    readonly projectStartDate: string;
    readonly projectEndDate: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly sections: readonly Section[];
}
