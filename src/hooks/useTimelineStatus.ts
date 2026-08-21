import { useMemo } from 'react';
import { useSectionStore } from '../stores/sectionStore';
import { getItemColor } from '../types/itemColor';
import type { Section, TimelineItem } from '../types/timeline';
import { todayKey } from '../utils/dayKeys';
import { forEachItem } from '../utils/itemTree';

/**
 * What the status panel reports: what is happening today, what starts next,
 * and which markers are still ahead.
 *
 * Every question here is answered by comparing day keys. They are
 * 'yyyy-MM-dd', so lexicographic order is chronological order and a plain
 * string comparison is the whole of the date maths.
 */

/** Names of the bars an item sits under, outermost first. */
export type Ancestry = readonly string[];

const NO_ANCESTORS: Ancestry = [];

export interface StatusItem {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  /** The item's own span, not its subtree's. */
  readonly start: string;
  readonly end: string;
  readonly sectionId: string;
  readonly sectionName: string;
  readonly ancestors: Ancestry;
}

export interface MilestoneItem {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly date: string;
  readonly sectionId: string;
  readonly sectionName: string;
  readonly ancestors: Ancestry;
}

export interface TimelineStatus {
  readonly inFlight: readonly StatusItem[];
  readonly nextUp: readonly StatusItem[];
  readonly upcomingMilestones: readonly MilestoneItem[];
}

interface WalkEntry {
  readonly item: TimelineItem;
  readonly color: string;
  readonly ancestors: Ancestry;
  /**
   * A bar with no bar children. Those are the units of actual work — a bar
   * that contains other bars is a container, and its leaves speak for it.
   */
  readonly isLeafBar: boolean;
}

/**
 * Visit every item in a schedule, at any depth, with its resolved colour and
 * ancestry. Collapse state is ignored on purpose: folding a bar away hides it
 * from the timeline, not from the schedule.
 */
function walkSection(section: Section, visit: (entry: WalkEntry) => void): void {
  const rootBarCount = section.items.filter((item) => item.kind === 'bar').length;
  // Depth-first pre-order means a parent is always resolved before its
  // children ask what colour and trail to inherit.
  const colors = new Map<string, string>();
  const trails = new Map<string, Ancestry>();
  let rootIndex = -1;

  forEachItem(section.items, (item, parent, depth) => {
    if (depth === 0 && item.kind === 'bar') rootIndex += 1;

    const inherited = parent ? colors.get(parent.id) : undefined;
    // A root milestone belongs to the schedule rather than to any one bar, so
    // it takes the schedule's colour instead of a slot in the palette.
    const color =
      item.kind === 'milestone'
        ? (item.color ?? inherited ?? section.color)
        : getItemColor(item, section, Math.max(0, rootIndex), rootBarCount, inherited);
    colors.set(item.id, color);

    const ancestors = parent
      ? [...(trails.get(parent.id) ?? NO_ANCESTORS), parent.name]
      : NO_ANCESTORS;
    trails.set(item.id, ancestors);

    visit({
      item,
      color,
      ancestors,
      isLeafBar: item.kind === 'bar' && !item.children.some((child) => child.kind === 'bar'),
    });
  });
}

export function useTimelineStatus(): TimelineStatus {
  const sections = useSectionStore((state) => state.sections);

  return useMemo(() => {
    const today = todayKey();
    const inFlight: StatusItem[] = [];
    const upcomingMilestones: MilestoneItem[] = [];
    // One "next" per schedule. The panel answers "what follows here?", so a
    // schedule with fifty queued bars still contributes a single line.
    const nextUpBySection = new Map<string, StatusItem>();

    const ordered = [...sections].sort((a, b) => a.order - b.order);

    for (const section of ordered) {
      walkSection(section, ({ item, color, ancestors, isLeafBar }) => {
        if (item.kind === 'milestone') {
          if (item.start >= today) {
            upcomingMilestones.push({
              id: item.id,
              name: item.name,
              color,
              date: item.start,
              sectionId: section.id,
              sectionName: section.name,
              ancestors,
            });
          }
          return;
        }

        if (!isLeafBar) return;

        const entry: StatusItem = {
          id: item.id,
          name: item.name,
          color,
          start: item.start,
          end: item.end,
          sectionId: section.id,
          sectionName: section.name,
          ancestors,
        };

        if (item.start <= today && today <= item.end) {
          inFlight.push(entry);
          return;
        }

        if (item.start > today) {
          const soonest = nextUpBySection.get(section.id);
          if (!soonest || item.start < soonest.start) nextUpBySection.set(section.id, entry);
        }
      });
    }

    // Schedules were walked in order and items depth-first, so in-flight and
    // next-up already read top-to-bottom the way the timeline does.
    upcomingMilestones.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return {
      inFlight,
      nextUp: [...nextUpBySection.values()],
      upcomingMilestones,
    };
  }, [sections]);
}
