import type { Section, TimelineItem } from '../types/timeline';
import type { ClusterSource, LandingTarget } from './dragCluster';
import { dayKeyDiff } from './dayKeys';
import { findItemPath } from './itemTree';
import { HEADER_HEIGHT } from './timelineUtils';

/**
 * Finding the things a drag picks up and puts down, on the page.
 *
 * Every draggable element carries `data-drag-item` with its item id, in both
 * columns; the column roots carry `data-flip-column`. Lookups are always made
 * inside a column root, which is what keeps the copies the sticky bands draw
 * under the axis — same ids, outside both roots — from ever being mistaken for
 * the row itself.
 */

export type DragColumn = 'plot' | 'labels';

export function columnRoot(column: DragColumn): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-flip-column="${column}"]`);
}

export function findDragElement(column: DragColumn, itemId: string): HTMLElement | null {
  const selector = `[data-drag-item="${CSS.escape(itemId)}"]`;
  const onSheet = columnRoot(column)?.querySelector<HTMLElement>(selector);
  if (onSheet || column === 'labels') return onSheet ?? null;
  // A root milestone of a schedule held under the axis prints only in its band:
  // there, the band's copy is the marker.
  return document.querySelector<HTMLElement>(`.timeline-scroll-container [data-drop-sticky] ${selector}`);
}

/** A schedule's own name row in the labels column. */
export function findScheduleLabel(sectionId: string): HTMLElement | null {
  return (
    columnRoot('labels')?.querySelector<HTMLElement>(
      `[data-section-label="${CSS.escape(sectionId)}"]`
    ) ?? null
  );
}

/**
 * Everything under an item that is on screen, in the order it is drawn.
 *
 * A folded group draws none of its children, so the walk simply finds no
 * element for them and moves on — the folded bar carries its own sign that it
 * holds more.
 */
export function visibleDescendants(item: TimelineItem, column: DragColumn): ClusterSource[] {
  const found: ClusterSource[] = [];
  const walk = (children: readonly TimelineItem[]): void => {
    for (const child of children) {
      const element = findDragElement(column, child.id);
      if (!element) continue;
      found.push({ id: child.id, element });
      walk(child.children);
    }
  };
  walk(item.children);
  return found;
}

/** The screen x a day key sits at on the sheet, read off the plot's own anchor. */
function dayScreenX(day: string): number | undefined {
  const root = columnRoot('plot');
  const origin = root?.dataset.flipOrigin;
  const pixelsPerDay = Number(root?.dataset.flipPpd);
  if (!root || !origin || !(pixelsPerDay > 0)) return undefined;
  return root.getBoundingClientRect().left + dayKeyDiff(origin, day) * pixelsPerDay;
}

function locate(
  sections: readonly Section[],
  itemId: string
): { section: Section; path: TimelineItem[] } | null {
  for (const section of sections) {
    const path = findItemPath(section.items, itemId);
    if (path) return { section, path };
  }
  return null;
}

/**
 * Where each member of a dropped cluster comes down, read from the committed
 * tree.
 *
 * Its own element first. Failing that, the member went somewhere folded, and
 * sinks into whatever now stands for it: the nearest ancestor that still draws,
 * then — for a folded schedule — the strip of tape its root bar prints as,
 * then the schedule's own row. A member that cannot be placed at all simply
 * fades where it is; nothing ever lands on the wrong row.
 */
export function landingTargets(
  itemIds: readonly string[],
  column: DragColumn,
  sections: readonly Section[]
): Map<string, LandingTarget> {
  const targets = new Map<string, LandingTarget>();

  for (const id of itemIds) {
    const own = findDragElement(column, id);
    // A marker printed in a band is already where it can be seen
    if (own && (own.closest('[data-drop-sticky]') !== null || !isUnderTheBands(own))) {
      targets.set(id, { mode: 'exact', resolve: () => findDragElement(column, id) });
      continue;
    }

    // Its row is there but scrolled away under the schedules held at the top:
    // the band that stands for its schedule is where it can be seen to land
    if (own) {
      const band = heldBand(column, own);
      if (band) {
        targets.set(id, { mode: 'absorb', resolve: () => band });
        continue;
      }
    }

    const located = locate(sections, id);
    if (!located) continue;
    const { section, path } = located;
    const item = path[path.length - 1];
    const left = column === 'plot' ? dayScreenX(item.start) : undefined;

    const ancestor = [...path.slice(0, -1)]
      .reverse()
      .find((candidate) => findDragElement(column, candidate.id));
    if (ancestor) {
      targets.set(id, {
        mode: 'absorb',
        resolve: () => findDragElement(column, ancestor.id),
        left,
      });
      continue;
    }

    if (column === 'plot') {
      const rootId = path[0].id;
      const tape = (): HTMLElement | null =>
        columnRoot('plot')?.querySelector<HTMLElement>(
          `[data-tape-item="${CSS.escape(rootId)}"]`
        ) ?? null;
      if (tape()) {
        targets.set(id, rootId === id ? { mode: 'exact', resolve: tape } : { mode: 'absorb', resolve: tape, left });
        continue;
      }
      const header = (): HTMLElement | null =>
        columnRoot('plot')?.querySelector<HTMLElement>(
          `[data-drop-header="${CSS.escape(section.id)}"]`
        ) ?? null;
      if (header()) targets.set(id, { mode: 'absorb', resolve: header, left });
      continue;
    }

    if (findScheduleLabel(section.id)) {
      targets.set(id, { mode: 'absorb', resolve: () => findScheduleLabel(section.id) });
    }
  }

  return targets;
}

/** The bottom of the axis and the bands held under it, in viewport px. */
function heldTop(): number {
  const scroller = document.querySelector<HTMLElement>('.timeline-scroll-container');
  let top = scroller ? scroller.getBoundingClientRect().top + HEADER_HEIGHT : 0;
  document.querySelectorAll<HTMLElement>('[data-drop-sticky]').forEach((band) => {
    top = Math.max(top, band.getBoundingClientRect().bottom);
  });
  return top;
}

/** Entirely hidden under the axis or the held bands. */
function isUnderTheBands(element: HTMLElement): boolean {
  return element.getBoundingClientRect().bottom <= heldTop();
}

/** The band (or its label) holding the schedule this element belongs to. */
function heldBand(column: DragColumn, element: HTMLElement): HTMLElement | null {
  const sectionId = element.closest<HTMLElement>('[data-flip-section]')?.dataset.flipSection;
  if (!sectionId) return null;
  const selector =
    column === 'plot'
      ? `[data-drop-sticky][data-drop-header="${CSS.escape(sectionId)}"]`
      : `[data-sticky-label="${CSS.escape(sectionId)}"]`;
  return document.querySelector<HTMLElement>(selector);
}

/** A drag called off goes back exactly where it came from. */
export function homeTargets(
  sources: readonly ClusterSource[],
  column: DragColumn
): Map<string, LandingTarget> {
  const targets = new Map<string, LandingTarget>();
  for (const { id, element } of sources) {
    const home = (): HTMLElement | null =>
      element.isConnected ? element : findDragElement(column, id);
    // Scrolled away under the held schedules while it was in the hand: it goes
    // home into the band that stands for it, not over the top of it
    const current = home();
    const band =
      current && current.closest('[data-drop-sticky]') === null && isUnderTheBands(current)
        ? heldBand(column, current)
        : null;
    targets.set(id, band ? { mode: 'absorb', resolve: () => band } : { mode: 'exact', resolve: home });
  }
  return targets;
}
