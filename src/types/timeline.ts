/**
 * The timeline model.
 *
 * One recursive item type carries everything that appears on the timeline.
 * A schedule holds items; an item holds items. There is no separate "phase",
 * "task" or "bar milestone" type — depth in the tree is the only difference
 * between them, and depth is decided by dragging, not by which button made it.
 *
 * Positions are ABSOLUTE dates ('yyyy-MM-dd'), never relative to a parent.
 * That is what makes drag-and-drop between parents, and between schedules,
 * a pure list operation: re-parenting an item does not move it.
 */

export type ItemKind = 'bar' | 'milestone';

export interface TimelineItem {
  id: string;
  /** A bar spans days and can hold children. A milestone is a single point. */
  kind: ItemKind;
  name: string;
  description: string;
  /** Inclusive left edge, 'yyyy-MM-dd'. For a milestone, its only date. */
  start: string;
  /** Right edge, 'yyyy-MM-dd'. Equals `start` for a milestone. */
  end: string;
  /** null inherits down the parent chain, ultimately from the schedule. */
  color: string | null;
  /** Hides this item's children. Milestones are always leaves. */
  isCollapsed: boolean;
  /** Blocks moving and resizing this item and everything under it. */
  isLocked?: boolean;
  children: TimelineItem[];
}

/** A schedule track. Its items are ordered by array position. */
export interface Section {
  id: string;
  name: string;
  type: 'schedule';
  templateId?: string;
  /** Incrementing version for import conflict detection. */
  revision: number;
  lastModifiedAt: string;
  sourceProjectId?: string;
  sourceProjectName?: string;
  order: number;
  /** Declared window, 'yyyy-MM-dd'. Items may live outside it; see sectionExtent. */
  startDate: string;
  endDate: string;
  items: TimelineItem[];
  color: string;
  /** Root items take palette colours instead of a gradient of the schedule colour. */
  isMulticolor?: boolean;
  isCollapsed: boolean;
  isLocked?: boolean;
}

/** Computed viewport bounds derived from every schedule and item. */
export interface ViewportBounds {
  startDate: Date;
  endDate: Date;
  /** The same bounds as day keys — what item positions are measured against. */
  startKey: string;
  endKey: string;
  totalDays: number;
}

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

export interface ModalPosition {
  x: number;
  y: number;
}

/**
 * One item, or one schedule, at a time. Items know their own parents, so a
 * selection no longer needs to carry a path tuple.
 */
export interface SelectionState {
  type: 'section' | 'item' | null;
  id: string | null;
  /** The schedule the selection lives in. */
  sectionId: string | null;
  position?: ModalPosition;
}

/**
 * Where a dragged item will land.
 * `into` nests it inside a bar; `slot` places it as a sibling at an index.
 */
export type DropTarget =
  | { readonly kind: 'into'; readonly sectionId: string; readonly parentId: string }
  | {
      readonly kind: 'slot';
      readonly sectionId: string;
      readonly parentId: string | null;
      readonly index: number;
    };

/** Stable string for a drop target, so rows can subscribe to "am I the target?". */
export function dropTargetKey(target: DropTarget | null): string | null {
  if (!target) return null;
  if (target.kind === 'into') return `into:${target.parentId}`;
  return `slot:${target.sectionId}:${target.parentId ?? 'root'}:${target.index}`;
}

export { getItemColor } from './itemColor';
