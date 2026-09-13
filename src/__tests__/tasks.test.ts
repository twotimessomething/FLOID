import { describe, it, expect, beforeEach } from 'vitest';
import type { Section, TimelineItem } from '../types';
import { flattenSection, getBarRect } from '../utils/timelineUtils';
import { isPointItem, itemDays } from '../utils/itemTree';
import { useSectionStore } from '../stores/sectionStore';
import { buildSlidePlan } from '../utils/slidePlan';
import type { Project } from '../types';
import { computeViewportBounds } from '../utils/dateUtils';

function bar(id: string, children: TimelineItem[] = []): TimelineItem {
  return {
    id,
    kind: 'bar',
    name: id,
    description: '',
    start: '2026-01-01',
    end: '2026-02-01',
    color: null,
    isCollapsed: false,
    children,
  };
}

function task(id: string, day = '2026-01-15', isDone = false): TimelineItem {
  return {
    id,
    kind: 'task',
    name: id,
    description: '',
    start: day,
    end: day,
    color: null,
    isCollapsed: false,
    isDone,
    children: [],
  };
}

function milestone(id: string, day = '2026-01-20'): TimelineItem {
  return { ...task(id, day), kind: 'milestone', isDone: undefined };
}

function section(items: TimelineItem[]): Section {
  return {
    id: 's',
    name: 'S',
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items,
    color: '#3a3f76',
    isCollapsed: false,
  };
}

describe('tasks', () => {
  it('is a point, like a milestone', () => {
    expect(isPointItem(task('t'))).toBe(true);
    expect(itemDays(task('t'))).toBe(0);
    const viewport = computeViewportBounds([section([task('t')])]);
    expect(getBarRect(task('t'), viewport, 10).width).toBe(0);
  });

  it('takes a row of its own at the root, unlike a root milestone', () => {
    const rows = flattenSection(section([milestone('m'), task('t'), bar('b', [task('nested')])]));
    expect(rows.map((row) => row.item.id)).toEqual(['t', 'b', 'nested']);
    // The task is the last root row, so it carries the trailing drop slot
    expect(rows.find((row) => row.item.id === 't')?.isLastRenderedSibling).toBe(false);
    expect(rows.find((row) => row.item.id === 'b')?.isLastRenderedSibling).toBe(true);
  });

  it('prints as a dot on the slide — hollow open, solid done', () => {
    const project: Project = {
      id: 'p1',
      name: 'P',
      pinnedSectionId: null,
      projectStartDate: '2026-01-01',
      projectEndDate: '2026-12-31',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const plan = buildSlidePlan(project, [section([task('open'), task('done', '2026-01-16', true)])]);
    const dots = plan.shapes.filter((shape) => shape.kind === 'dot');
    expect(dots.map((dot) => dot.name)).toEqual(['open', 'done']);
    expect(dots[0]).toMatchObject({ outline: { color: '17171A' } });
    expect(dots[1]).toMatchObject({ fill: '17171A' });
    expect(dots[1]).not.toHaveProperty('outline', expect.anything());
  });
});

describe('sectionStore with tasks', () => {
  beforeEach(() => {
    useSectionStore.setState({ sections: [section([task('t'), bar('b')])], dependencies: [] });
  });

  it('toggles done on a task and nothing else', () => {
    const { toggleItemDone } = useSectionStore.getState();
    toggleItemDone('s', 't');
    expect(useSectionStore.getState().sections[0].items[0].isDone).toBe(true);
    toggleItemDone('s', 't');
    expect(useSectionStore.getState().sections[0].items[0].isDone).toBe(false);
    toggleItemDone('s', 'b');
    expect(useSectionStore.getState().sections[0].items[1].isDone).toBeUndefined();
  });

  it('keeps both edges on one day when a task is re-dated', () => {
    const { setItemDates, updateItem } = useSectionStore.getState();
    setItemDates('s', 't', '2026-03-01', '2026-04-01');
    let saved = useSectionStore.getState().sections[0].items[0];
    expect(saved.start).toBe('2026-03-01');
    expect(saved.end).toBe('2026-03-01');
    updateItem('s', 't', { start: '2026-05-05' });
    saved = useSectionStore.getState().sections[0].items[0];
    expect(saved.end).toBe('2026-05-05');
  });
});
