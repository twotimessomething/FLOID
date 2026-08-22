import { describe, it, expect, beforeEach } from 'vitest';
import type { DependencyEdge, Section, TimelineItem } from '../types';
import { useSectionStore } from '../stores/sectionStore';

function bar(id: string, start: string, end: string, children: TimelineItem[] = []): TimelineItem {
  return {
    id,
    kind: 'bar',
    name: id,
    description: '',
    start,
    end,
    color: null,
    isCollapsed: false,
    children,
  };
}

function section(id: string, items: TimelineItem[]): Section {
  return {
    id,
    name: id,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items,
    color: '#333333',
    isCollapsed: false,
  };
}

const edgeIds = (): string[] => useSectionStore.getState().dependencies.map((e) => e.id);

beforeEach(() => {
  useSectionStore.setState({
    sections: [
      section('s1', [
        bar('a', '2026-01-01', '2026-02-01'),
        bar('b', '2026-02-01', '2026-03-01', [bar('b1', '2026-02-05', '2026-02-10')]),
        bar('c', '2026-03-01', '2026-04-01'),
      ]),
      section('s2', [bar('x', '2026-01-01', '2026-02-01')]),
    ],
    dependencies: [],
  });
  useSectionStore.temporal.getState().clear();
});

describe('addDependency', () => {
  it('draws a link and derives nothing — the anchors are the type', () => {
    const id = useSectionStore.getState().addDependency('a', 'end', 'b', 'start');
    expect(id).not.toBeNull();
    const [edge] = useSectionStore.getState().dependencies;
    expect(edge).toMatchObject({ from: 'a', fromAnchor: 'end', to: 'b', toAnchor: 'start' });
  });

  it('links across schedules', () => {
    expect(useSectionStore.getState().addDependency('a', 'end', 'x', 'start')).not.toBeNull();
  });

  it('refuses self-links, parent-child links and exact duplicates', () => {
    const store = useSectionStore.getState();
    expect(store.addDependency('a', 'end', 'a', 'start')).toBeNull();
    expect(store.addDependency('b', 'end', 'b1', 'start')).toBeNull();
    expect(store.addDependency('b1', 'end', 'b', 'start')).toBeNull();
    expect(store.addDependency('a', 'end', 'b', 'start')).not.toBeNull();
    expect(useSectionStore.getState().addDependency('a', 'end', 'b', 'start')).toBeNull();
    expect(useSectionStore.getState().dependencies).toHaveLength(1);
  });

  it('allows a second link between the same pair on different anchors', () => {
    useSectionStore.getState().addDependency('a', 'start', 'b', 'start');
    expect(useSectionStore.getState().addDependency('a', 'end', 'b', 'end')).not.toBeNull();
    expect(useSectionStore.getState().dependencies).toHaveLength(2);
  });
});

describe('retargetDependency', () => {
  it('moves one end and keeps the id', () => {
    const id = useSectionStore.getState().addDependency('a', 'end', 'b', 'start') as string;
    expect(useSectionStore.getState().retargetDependency(id, 'to', 'c', 'start')).toBe(true);
    const [edge] = useSectionStore.getState().dependencies;
    expect(edge).toMatchObject({ id, from: 'a', to: 'c' });
  });

  it('refuses a retarget that would break the linking rules', () => {
    const id = useSectionStore.getState().addDependency('a', 'end', 'b', 'start') as string;
    expect(useSectionStore.getState().retargetDependency(id, 'to', 'a', 'start')).toBe(false);
    expect(useSectionStore.getState().dependencies[0].to).toBe('b');
  });
});

describe('cascades — a link never outlives its items', () => {
  let ab: string;
  let b1x: string;
  beforeEach(() => {
    const store = useSectionStore.getState();
    ab = store.addDependency('a', 'end', 'b', 'start') as string;
    b1x = useSectionStore.getState().addDependency('b1', 'end', 'x', 'start') as string;
  });

  it('deleting an item takes the links on its whole subtree', () => {
    useSectionStore.getState().deleteItem('s1', 'b');
    // b went, and b1 inside it — both links go
    expect(edgeIds()).toEqual([]);
  });

  it('deleting an unrelated item leaves links alone', () => {
    useSectionStore.getState().deleteItem('s1', 'c');
    expect(edgeIds()).toEqual([ab, b1x]);
  });

  it('deleting a schedule takes every link touching it', () => {
    useSectionStore.getState().deleteSection('s2');
    expect(edgeIds()).toEqual([ab]);
  });

  it('dropping an item into a bar it is linked with clears that link — nesting replaces it', () => {
    useSectionStore.getState().moveItem({
      itemId: 'a',
      fromSectionId: 's1',
      toSectionId: 's1',
      toParentId: 'b',
      toIndex: 0,
      dayDelta: 0,
    });
    expect(edgeIds()).toEqual([b1x]);
  });

  it('an ordinary move carries its links along untouched', () => {
    useSectionStore.getState().moveItem({
      itemId: 'a',
      fromSectionId: 's1',
      toSectionId: 's2',
      toParentId: null,
      toIndex: 1,
      dayDelta: 5,
    });
    expect(edgeIds()).toEqual([ab, b1x]);
  });
});

describe('undo covers dependencies', () => {
  it('rewinds a drawn link with the rest of the sheet', () => {
    useSectionStore.getState().addDependency('a', 'end', 'b', 'start');
    expect(useSectionStore.getState().dependencies).toHaveLength(1);
    useSectionStore.temporal.getState().undo();
    expect(useSectionStore.getState().dependencies).toHaveLength(0);
    useSectionStore.temporal.getState().redo();
    expect(useSectionStore.getState().dependencies).toHaveLength(1);
  });

  it('one undo brings back a deleted item and the links that went with it', () => {
    useSectionStore.getState().addDependency('a', 'end', 'b', 'start');
    useSectionStore.getState().deleteItem('s1', 'b');
    expect(useSectionStore.getState().dependencies).toHaveLength(0);
    useSectionStore.temporal.getState().undo();
    const state = useSectionStore.getState();
    expect(state.dependencies).toHaveLength(1);
    expect(state.sections[0].items.map((i) => i.id)).toContain('b');
  });
});

// A dependency edge in flight through a drag transaction survives the rollback
describe('drag transactions', () => {
  it('rollback restores both the sections and the links', () => {
    const store = useSectionStore.getState();
    const id = store.addDependency('a', 'end', 'b', 'start');
    expect(id).not.toBeNull();
    useSectionStore.getState().beginDragTransaction();
    useSectionStore.getState().removeDependency(id as string);
    useSectionStore.getState().shiftItem('s1', 'a', 10);
    useSectionStore.getState().rollbackDragTransaction();
    const state = useSectionStore.getState();
    expect(state.dependencies.map((e: DependencyEdge) => e.id)).toEqual([id]);
    expect(state.sections[0].items[0].start).toBe('2026-01-01');
  });
});

describe('link mutations stamp the schedules they annotate', () => {
  const revisionOf = (id: string): number =>
    useSectionStore.getState().sections.find((sec) => sec.id === id)!.revision;

  it('bumps both endpoints\u2019 schedules when a link is drawn', () => {
    const before = { s1: revisionOf('s1'), s2: revisionOf('s2') };
    useSectionStore.getState().addDependency('a', 'end', 'x', 'start');
    expect(revisionOf('s1')).toBe(before.s1 + 1);
    expect(revisionOf('s2')).toBe(before.s2 + 1);
  });

  it('bumps a schedule once when both ends live in it', () => {
    const before = revisionOf('s1');
    useSectionStore.getState().addDependency('a', 'end', 'b', 'start');
    expect(revisionOf('s1')).toBe(before + 1);
  });

  it('bumps on removal too — a `.floid` carries the links inside it', () => {
    const id = useSectionStore.getState().addDependency('a', 'end', 'b', 'start')!;
    const before = revisionOf('s1');
    useSectionStore.getState().removeDependency(id);
    expect(revisionOf('s1')).toBe(before + 1);
  });

  it('leaves revisions alone when a draw is rejected', () => {
    const before = revisionOf('s1');
    expect(useSectionStore.getState().addDependency('b', 'end', 'b1', 'start')).toBeNull();
    expect(revisionOf('s1')).toBe(before);
  });

  it('stamps the schedules on both sides of a retarget', () => {
    const id = useSectionStore.getState().addDependency('a', 'end', 'b', 'start')!;
    const before = { s1: revisionOf('s1'), s2: revisionOf('s2') };
    expect(useSectionStore.getState().retargetDependency(id, 'to', 'x', 'start')).toBe(true);
    expect(revisionOf('s1')).toBe(before.s1 + 1);
    expect(revisionOf('s2')).toBe(before.s2 + 1);
  });
});

describe('setSectionsAndDependencies', () => {
  it('lands both halves in one undoable step', () => {
    const { sections, dependencies } = useSectionStore.getState();
    const added = section('s3', [bar('z', '2026-01-01', '2026-02-01')]);
    const edge: DependencyEdge = {
      id: 'e-new',
      from: 'z',
      fromAnchor: 'end',
      to: 'a',
      toAnchor: 'start',
    };

    useSectionStore.getState().setSectionsAndDependencies([...sections, added], [...dependencies, edge]);
    expect(useSectionStore.getState().sections).toHaveLength(3);
    expect(edgeIds()).toEqual(['e-new']);

    useSectionStore.temporal.getState().undo();
    // One undo takes the schedule and its links together, never half of each
    expect(useSectionStore.getState().sections).toHaveLength(2);
    expect(edgeIds()).toEqual([]);
  });
});
