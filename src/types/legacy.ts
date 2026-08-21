/**
 * The pre-unification model, kept only so saved projects and .floid files
 * written before the item model can still be read. Nothing in the running app
 * should reference these types outside of `utils/migrateLegacy.ts`.
 */

export interface LegacyBarMilestone {
  id: string;
  name: string;
  relativePosition: number;
}

export interface LegacyTask {
  id: string;
  phaseId?: string;
  name: string;
  description?: string;
  relativeStart: number;
  relativeEnd: number;
  order?: number;
  barMilestones?: LegacyBarMilestone[];
}

export interface LegacyPhase {
  id: string;
  sectionId?: string;
  name: string;
  description?: string;
  color?: string | null;
  order?: number;
  isCollapsed?: boolean;
  isLocked?: boolean;
  tasks?: LegacyTask[];
  barMilestones?: LegacyBarMilestone[];
  relativeStart: number;
  relativeEnd: number;
}

export interface LegacyMilestone {
  id: string;
  sectionId?: string;
  name: string;
  description?: string;
  relativePosition: number;
  order?: number;
}

export interface LegacySection {
  id: string;
  name: string;
  type?: string;
  templateId?: string;
  revision?: number;
  lastModifiedAt?: string;
  sourceProjectId?: string;
  sourceProjectName?: string;
  order?: number;
  startDate: string;
  endDate: string;
  phases?: LegacyPhase[];
  milestones?: LegacyMilestone[];
  color: string;
  isMulticolor?: boolean;
  isCollapsed?: boolean;
  isLocked?: boolean;
}

/** True when a stored section still uses the phase/task shape. */
export function isLegacySection(section: unknown): section is LegacySection {
  if (!section || typeof section !== 'object') return false;
  const candidate = section as Record<string, unknown>;
  return Array.isArray(candidate.phases) && !Array.isArray(candidate.items);
}
