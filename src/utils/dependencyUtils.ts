import type { DependencyAnchor, DependencyEdge, TimelineItem } from '../types/timeline';
import { findItemPath, forEachItem } from './itemTree';

/** Anything holding an item tree — a schedule, or a parsed file on its way in. */
interface ItemContainer {
  readonly items: readonly TimelineItem[];
}

/**
 * Pure operations on dependency edges.
 *
 * An edge is ink, not physics: nothing here moves an item. The one question an
 * edge can answer — is the order it records still true? — is a single day-key
 * comparison, because whichever anchors were connected, "broken" always means
 * the target's anchor day now falls before the source's.
 */

/** The day an anchor stands on. A milestone's two edges are the same day. */
export function anchorDay(item: TimelineItem, anchor: DependencyAnchor): string {
  return anchor === 'start' ? item.start : item.end;
}

/**
 * True when the drawn order no longer holds. Day keys compare as strings.
 * A bar's `end` is its exclusive right edge, so a successor starting on the
 * very day its predecessor ends is back-to-back, not broken.
 */
export function isDependencyViolated(
  edge: DependencyEdge,
  from: TimelineItem,
  to: TimelineItem
): boolean {
  return anchorDay(to, edge.toAnchor) < anchorDay(from, edge.fromAnchor);
}

/** Every item across every schedule, by id — edges cross schedules freely. */
export function indexItems(sections: readonly ItemContainer[]): Map<string, TimelineItem> {
  const map = new Map<string, TimelineItem>();
  for (const section of sections) {
    forEachItem(section.items, (item) => map.set(item.id, item));
  }
  return map;
}

/** The schedule an item lives in right now, or null. */
export function sectionOfItem<T extends ItemContainer>(
  sections: readonly T[],
  itemId: string
): T | null {
  for (const section of sections) {
    if (findItemPath(section.items, itemId)) return section;
  }
  return null;
}

export function isDuplicateEdge(
  edges: readonly DependencyEdge[],
  from: string,
  fromAnchor: DependencyAnchor,
  to: string,
  toAnchor: DependencyAnchor
): boolean {
  return edges.some(
    (edge) =>
      edge.from === from &&
      edge.to === to &&
      edge.fromAnchor === fromAnchor &&
      edge.toAnchor === toAnchor
  );
}

/**
 * Whether two items may be linked at all. Nesting already *is* a relationship,
 * so an item never links to its own ancestor or descendant — and never to
 * itself. Both directions of the ancestry check ride on one path lookup.
 */
export function canLinkItems(sections: readonly ItemContainer[], a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  const sectionA = sectionOfItem(sections, a);
  const sectionB = sectionOfItem(sections, b);
  if (!sectionA || !sectionB) return false;
  // Different schedules cannot be kin
  if (sectionA !== sectionB) return true;
  const pathToA = findItemPath(sectionA.items, a);
  if (pathToA?.some((item) => item.id === b)) return false;
  const pathToB = findItemPath(sectionA.items, b);
  if (pathToB?.some((item) => item.id === a)) return false;
  return true;
}

/** Edges with at least one endpoint in the given set. */
export function edgesTouching(
  edges: readonly DependencyEdge[],
  ids: ReadonlySet<string>
): DependencyEdge[] {
  return edges.filter((edge) => ids.has(edge.from) || ids.has(edge.to));
}

/** The same list without any edge touching the given set. */
export function pruneEdgesTouching(
  edges: readonly DependencyEdge[],
  ids: ReadonlySet<string>
): DependencyEdge[] {
  const kept = edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to));
  return kept.length === edges.length ? (edges as DependencyEdge[]) : kept;
}

/** Drop edges whose endpoints no longer exist anywhere on the sheet. */
export function pruneDanglingEdges(
  edges: readonly DependencyEdge[],
  sections: readonly ItemContainer[]
): DependencyEdge[] {
  if (edges.length === 0) return edges as DependencyEdge[];
  const items = indexItems(sections);
  const kept = edges.filter((edge) => items.has(edge.from) && items.has(edge.to));
  return kept.length === edges.length ? (edges as DependencyEdge[]) : kept;
}

/**
 * Re-point edges after an import has reminted item ids. An endpoint the map
 * does not know was not part of what was imported, so its edge is dropped —
 * a cross-schedule link cannot follow a single schedule into another project.
 */
export function remapEdgeItemIds(
  edges: readonly DependencyEdge[],
  idMap: ReadonlyMap<string, string>,
  generateId: () => string
): DependencyEdge[] {
  const remapped: DependencyEdge[] = [];
  for (const edge of edges) {
    const from = idMap.get(edge.from);
    const to = idMap.get(edge.to);
    if (from && to) remapped.push({ ...edge, id: generateId(), from, to });
  }
  return remapped;
}

/** Only the edges that live entirely inside one schedule — what a `.floid` share carries. */
export function edgesWithinSection(
  edges: readonly DependencyEdge[],
  section: ItemContainer
): DependencyEdge[] {
  const ids = new Set<string>();
  forEachItem(section.items, (item) => ids.add(item.id));
  return edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
}

/** Loosely typed edges from a file or old save, kept only if they hold up. */
export function readStoredEdges(value: unknown): DependencyEdge[] {
  if (!Array.isArray(value)) return [];
  const isAnchor = (a: unknown): a is DependencyAnchor => a === 'start' || a === 'end';
  return value.filter((edge: unknown): edge is DependencyEdge => {
    if (typeof edge !== 'object' || edge === null) return false;
    const e = edge as Record<string, unknown>;
    return (
      typeof e.id === 'string' &&
      typeof e.from === 'string' &&
      typeof e.to === 'string' &&
      e.from !== e.to &&
      isAnchor(e.fromAnchor) &&
      isAnchor(e.toAnchor)
    );
  });
}
