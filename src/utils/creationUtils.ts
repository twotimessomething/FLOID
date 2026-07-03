import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { getDaysBetween } from './dateUtils';
import { getNextPhaseColor } from '../constants/colors';

/**
 * Single source of truth for interactively creating timeline items.
 * Every entry point (double-click, drag-to-draw, hover "+" buttons, context
 * menu) routes through these helpers so default sizes, insertion order, and
 * post-create selection behave identically everywhere.
 *
 * Call only from event handlers — these read stores via getState().
 */

export const DEFAULT_PHASE_DAYS = 30;
export const DEFAULT_TASK_DAYS = 7;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

interface CreatePhaseOptions {
  /** Explicit section-relative range (drag-to-draw). */
  readonly span?: Span;
  /** Section-relative start for a default-width phase (double-click, "+" button). */
  readonly startAt?: number;
  /** Insert directly after this phase; omitted appends at the end. */
  readonly afterPhaseId?: string;
}

interface CreateTaskOptions {
  /** Explicit phase-relative range (drag-to-draw). */
  readonly span?: Span;
  /** Phase-relative start for a default-width task (double-click, "+" button). */
  readonly startAt?: number;
  /** Insert directly after this task; omitted appends at the end. */
  readonly afterTaskId?: string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Resolve a placement to a [start, end] range within 0-1 parent bounds. */
function resolveRange(
  options: { span?: Span; startAt?: number },
  fallbackStart: number,
  defaultWidth: number,
  minWidth: number
): { relativeStart: number; relativeEnd: number } {
  if (options.span) {
    let relativeStart = clamp01(Math.min(options.span.start, options.span.end));
    let relativeEnd = clamp01(Math.max(options.span.start, options.span.end));
    if (relativeEnd - relativeStart < minWidth) {
      relativeEnd = Math.min(1, relativeStart + minWidth);
      relativeStart = Math.max(0, relativeEnd - minWidth);
    }
    return { relativeStart, relativeEnd };
  }

  const start = clamp01(options.startAt ?? fallbackStart);
  const relativeEnd = Math.min(1, start + defaultWidth);
  return {
    relativeStart: Math.min(start, Math.max(0, relativeEnd - minWidth)),
    relativeEnd,
  };
}

/** Create a phase, insert it at the right order, and select it. */
export function createPhaseAt(
  sectionId: string,
  options: CreatePhaseOptions,
  selectAt: Point
): string | null {
  const store = useSectionStore.getState();
  const section = store.sections.find((s) => s.id === sectionId);
  if (!section) return null;

  const sectionDays = getDaysBetween(section.startDate, section.endDate);
  const defaultWidth = sectionDays > 0 ? Math.min(1, DEFAULT_PHASE_DAYS / sectionDays) : 0.15;
  const minWidth = sectionDays > 0 ? Math.min(1, 1 / sectionDays) : 0.01;

  // With no explicit placement, continue after the last phase
  const lastPhaseEnd = section.phases.reduce((max, p) => Math.max(max, p.relativeEnd), 0);
  const { relativeStart, relativeEnd } = resolveRange(options, lastPhaseEnd, defaultWidth, minWidth);

  const afterPhase = options.afterPhaseId
    ? section.phases.find((p) => p.id === options.afterPhaseId)
    : undefined;
  const insertOrder = afterPhase ? afterPhase.order + 1 : section.phases.length;

  const newId = store.addPhase(sectionId, {
    name: '',
    description: '',
    color: section.isMulticolor ? getNextPhaseColor(section.phases.length) : null,
    order: insertOrder,
    isCollapsed: true,
    tasks: [],
    relativeStart,
    relativeEnd,
  });

  // addPhase appends; move the new phase into its insertion slot when needed
  if (afterPhase) {
    const currentIndex = section.phases.length;
    const targetIndex = Math.min(insertOrder, currentIndex);
    if (currentIndex !== targetIndex) {
      store.reorderPhases(sectionId, currentIndex, targetIndex);
    }
  }

  useUIStore.getState().selectItem('phase', newId, sectionId, null, selectAt);
  return newId;
}

/** Create a task within a phase, insert it at the right order, and select it. */
export function createTaskAt(
  sectionId: string,
  phaseId: string,
  options: CreateTaskOptions,
  selectAt: Point
): string | null {
  const store = useSectionStore.getState();
  const section = store.sections.find((s) => s.id === sectionId);
  const phase = section?.phases.find((p) => p.id === phaseId);
  if (!section || !phase) return null;

  const sectionDays = getDaysBetween(section.startDate, section.endDate);
  const phaseWidth = phase.relativeEnd - phase.relativeStart;
  const hasScale = sectionDays > 0 && phaseWidth > 0;
  const defaultWidth = hasScale ? Math.min(1, DEFAULT_TASK_DAYS / sectionDays / phaseWidth) : 0.15;
  const minWidth = hasScale ? Math.min(1, 1 / sectionDays / phaseWidth) : 0.02;

  const { relativeStart, relativeEnd } = resolveRange(options, 0, defaultWidth, minWidth);

  const afterIndex = options.afterTaskId
    ? phase.tasks.findIndex((t) => t.id === options.afterTaskId)
    : -1;
  const insertOrder = afterIndex >= 0 ? phase.tasks[afterIndex].order + 1 : phase.tasks.length;

  const newId = store.addTask(sectionId, phaseId, {
    name: '',
    description: '',
    relativeStart,
    relativeEnd,
    order: insertOrder,
  });

  // addTask appends; move the new task into its insertion slot when needed
  if (afterIndex >= 0) {
    const currentIndex = phase.tasks.length;
    const targetIndex = Math.min(afterIndex + 1, currentIndex);
    if (currentIndex !== targetIndex) {
      store.reorderTasks(sectionId, phaseId, currentIndex, targetIndex);
    }
  }

  // A task hidden inside a collapsed phase would be invisible — reveal it
  if (phase.isCollapsed) {
    store.togglePhaseCollapse(sectionId, phaseId);
  }

  useUIStore.getState().selectItem('task', newId, sectionId, phaseId, selectAt);
  return newId;
}

/** Create a section milestone at a section-relative position and select it. */
export function createMilestoneAt(
  sectionId: string,
  relativePosition: number,
  selectAt: Point
): string | null {
  const store = useSectionStore.getState();
  const section = store.sections.find((s) => s.id === sectionId);
  if (!section) return null;

  const newId = store.addMilestone(sectionId, {
    name: '',
    description: '',
    relativePosition: clamp01(relativePosition),
    order: section.milestones.length,
  });

  useUIStore.getState().selectItem('milestone', newId, sectionId, null, selectAt);
  return newId;
}

/** Create a bar milestone on a phase bar (taskId null) or task bar, and select it. */
export function createBarMilestoneAt(
  sectionId: string,
  phaseId: string,
  taskId: string | null,
  relativePosition: number,
  selectAt: Point
): string {
  const store = useSectionStore.getState();
  const barMilestone = { name: '', relativePosition: clamp01(relativePosition) };

  const newId = taskId
    ? store.addTaskBarMilestone(sectionId, phaseId, taskId, barMilestone)
    : store.addPhaseBarMilestone(sectionId, phaseId, barMilestone);

  useUIStore.getState().selectItem('barMilestone', newId, sectionId, phaseId, selectAt, taskId ?? undefined);
  return newId;
}
