import { addDays } from 'date-fns';
import type { Section, TimelineItem } from '../types/timeline';
import type {
  LegacyBarMilestone,
  LegacyMilestone,
  LegacyPhase,
  LegacySection,
  LegacyTask,
} from '../types/legacy';
import { isLegacySection } from '../types/legacy';
import { generateId } from './idUtils';
import { addDaysToKey, dayKeyDiff, fromDayKey, normalizeDayKey, toDayKey } from './dayKeys';

/**
 * Reads the phase/task/bar-milestone model and returns the item model.
 *
 * Relative positions only mean anything against the range they were measured
 * in, so every level is resolved to an absolute date here — phases against the
 * schedule, tasks against their phase, bar milestones against their bar. After
 * this runs, nothing in the app needs to know the old shape existed.
 *
 * Bar milestones become ordinary milestone items nested under the bar they were
 * drawn on. They gain a row of their own, which is where they now live.
 */

/** Resolve a 0-1 position inside an absolute day range to a day key. */
function positionToKey(startKey: string, days: number, position: number): string {
  return addDaysToKey(startKey, Math.round(position * days));
}

function migrateBarMilestone(
  barMilestone: LegacyBarMilestone,
  barStartKey: string,
  barDays: number
): TimelineItem {
  const at = positionToKey(barStartKey, barDays, barMilestone.relativePosition);
  return {
    id: barMilestone.id || generateId(),
    kind: 'milestone',
    name: barMilestone.name ?? '',
    description: '',
    start: at,
    end: at,
    color: null,
    isCollapsed: false,
    children: [],
  };
}

function migrateTask(task: LegacyTask, phaseStartKey: string, phaseDays: number): TimelineItem {
  const start = positionToKey(phaseStartKey, phaseDays, task.relativeStart);
  const rawEnd = positionToKey(phaseStartKey, phaseDays, task.relativeEnd);
  const end = dayKeyDiff(start, rawEnd) < 1 ? addDaysToKey(start, 1) : rawEnd;
  const days = Math.max(1, dayKeyDiff(start, end));

  return {
    id: task.id || generateId(),
    kind: 'bar',
    name: task.name ?? '',
    description: task.description ?? '',
    start,
    end,
    color: null,
    isCollapsed: false,
    children: (task.barMilestones ?? []).map((bm) => migrateBarMilestone(bm, start, days)),
  };
}

function migratePhase(phase: LegacyPhase, sectionStartKey: string, sectionDays: number): TimelineItem {
  const start = positionToKey(sectionStartKey, sectionDays, phase.relativeStart);
  const rawEnd = positionToKey(sectionStartKey, sectionDays, phase.relativeEnd);
  const end = dayKeyDiff(start, rawEnd) < 1 ? addDaysToKey(start, 1) : rawEnd;
  const days = Math.max(1, dayKeyDiff(start, end));

  const tasks = byOrder(phase.tasks ?? []).map((task) => migrateTask(task, start, days));
  const markers = (phase.barMilestones ?? []).map((bm) => migrateBarMilestone(bm, start, days));

  return {
    id: phase.id || generateId(),
    kind: 'bar',
    name: phase.name ?? '',
    description: phase.description ?? '',
    start,
    end,
    color: phase.color ?? null,
    isCollapsed: phase.isCollapsed ?? false,
    isLocked: phase.isLocked,
    children: [...tasks, ...markers],
  };
}

function migrateMilestone(
  milestone: LegacyMilestone,
  sectionStartKey: string,
  sectionDays: number
): TimelineItem {
  const at = positionToKey(sectionStartKey, sectionDays, milestone.relativePosition);
  return {
    id: milestone.id || generateId(),
    kind: 'milestone',
    name: milestone.name ?? '',
    description: milestone.description ?? '',
    start: at,
    end: at,
    color: null,
    isCollapsed: false,
    children: [],
  };
}

function byOrder<T extends { order?: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function migrateLegacySection(legacy: LegacySection, index = 0): Section {
  const startDate = normalizeDayKey(legacy.startDate);
  const endDate = normalizeDayKey(legacy.endDate);
  const days = Math.max(1, dayKeyDiff(startDate, endDate));

  const phases = byOrder(legacy.phases ?? []).map((phase) => migratePhase(phase, startDate, days));
  const milestones = byOrder(legacy.milestones ?? []).map((milestone) =>
    migrateMilestone(milestone, startDate, days)
  );

  return {
    id: legacy.id,
    name: legacy.name ?? '',
    type: 'schedule',
    templateId: legacy.templateId,
    revision: legacy.revision ?? 1,
    lastModifiedAt: legacy.lastModifiedAt ?? new Date().toISOString(),
    sourceProjectId: legacy.sourceProjectId,
    sourceProjectName: legacy.sourceProjectName,
    order: legacy.order ?? index,
    startDate,
    endDate,
    items: [...phases, ...milestones],
    color: legacy.color,
    isMulticolor: legacy.isMulticolor,
    isCollapsed: legacy.isCollapsed ?? false,
    isLocked: legacy.isLocked,
  };
}

/** Normalise a section that is already on the item model. */
function normalizeSection(section: Section, index: number): Section {
  return {
    ...section,
    type: 'schedule',
    order: section.order ?? index,
    startDate: normalizeDayKey(section.startDate),
    endDate: normalizeDayKey(section.endDate),
    items: normalizeItems(section.items ?? []),
    isCollapsed: section.isCollapsed ?? false,
    revision: section.revision ?? 1,
    lastModifiedAt: section.lastModifiedAt ?? new Date().toISOString(),
  };
}

function normalizeItems(items: readonly TimelineItem[]): TimelineItem[] {
  return items.map((item) => {
    const start = normalizeDayKey(item.start);
    const end = item.kind === 'milestone' ? start : normalizeDayKey(item.end);
    return {
      ...item,
      start,
      end: item.kind === 'bar' && dayKeyDiff(start, end) < 1 ? addDaysToKey(start, 1) : end,
      color: item.color ?? null,
      description: item.description ?? '',
      isCollapsed: item.isCollapsed ?? false,
      children: normalizeItems(item.children ?? []),
    };
  });
}

/** Accepts a mixed list of legacy and current sections and returns current ones. */
export function migrateSections(sections: readonly unknown[]): Section[] {
  return sections.map((section, index) =>
    isLegacySection(section)
      ? migrateLegacySection(section, index)
      : normalizeSection(section as Section, index)
  );
}

/** A default 12-month window starting on the first of the current month. */
export function createDefaultWindow(): { startDate: string; endDate: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: toDayKey(first),
    endDate: toDayKey(addDays(fromDayKey(toDayKey(first)), 365)),
  };
}
