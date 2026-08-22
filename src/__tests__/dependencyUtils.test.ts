import { describe, it, expect } from 'vitest';
import type { DependencyEdge, Section, TimelineItem } from '../types';
import {
  anchorDay,
  canLinkItems,
  edgesTouching,
  edgesWithinSection,
  isDependencyViolated,
  isDuplicateEdge,
  pruneDanglingEdges,
  pruneEdgesTouching,
  readStoredEdges,
  remapEdgeItemIds,
} from '../utils/dependencyUtils';

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

function milestone(id: string, day: string): TimelineItem {
  return {
    id,
    kind: 'milestone',
    name: id,
    description: '',
    start: day,
    end: day,
    color: null,
    isCollapsed: false,
    children: [],
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

function edge(
  id: string,
  from: string,
  fromAnchor: 'start' | 'end',
  to: string,
  toAnchor: 'start' | 'end'
): DependencyEdge {
  return { id, from, fromAnchor, to, toAnchor };
}

describe('isDependencyViolated', () => {
  const a = bar('a', '2026-01-01', '2026-02-01');
  const b = bar('b', '2026-02-01', '2026-03-01');

  it('finish-to-start holds when the successor starts on or after the finish', () => {
    // b starts exactly the day a ends: back-to-back, not broken
    expect(isDependencyViolated(edge('e', 'a', 'end', 'b', 'start'), a, b)).toBe(false);
  });

  it('finish-to-start breaks when the successor slides before the finish', () => {
    const early = bar('b', '2026-01-15', '2026-03-01');
    expect(isDependencyViolated(edge('e', 'a', 'end', 'b', 'start'), a, early)).toBe(true);
  });

  it('start-to-start compares the two starts', () => {
    expect(isDependencyViolated(edge('e', 'a', 'start', 'b', 'start'), a, b)).toBe(false);
    const earlier = bar('b', '2025-12-01', '2026-03-01');
    expect(isDependencyViolated(edge('e', 'a', 'start', 'b', 'start'), a, earlier)).toBe(true);
  });

  it('finish-to-finish compares the two ends', () => {
    expect(isDependencyViolated(edge('e', 'a', 'end', 'b', 'end'), a, b)).toBe(false);
    const shorter = bar('b', '2025-12-01', '2026-01-15');
    expect(isDependencyViolated(edge('e', 'a', 'end', 'b', 'end'), a, shorter)).toBe(true);
  });

  it('treats a milestone as the point it is, whatever anchor the edge stored', () => {
    const gate = milestone('m', '2026-02-01');
    expect(anchorDay(gate, 'start')).toBe(anchorDay(gate, 'end'));
    // Work gated on the milestone: fine at the gate, broken before it
    expect(isDependencyViolated(edge('e', 'm', 'end', 'b', 'start'), gate, b)).toBe(false);
    const early = bar('b', '2026-01-20', '2026-03-01');
    expect(isDependencyViolated(edge('e', 'm', 'end', 'b', 'start'), gate, early)).toBe(true);
  });
});

describe('canLinkItems', () => {
  const sections = [
    section('s1', [
      bar('a', '2026-01-01', '2026-02-01', [bar('a1', '2026-01-05', '2026-01-10')]),
      bar('b', '2026-02-01', '2026-03-01'),
    ]),
    section('s2', [bar('x', '2026-01-01', '2026-02-01')]),
  ];

  it('links siblings, and links across schedules', () => {
    expect(canLinkItems(sections, 'a', 'b')).toBe(true);
    expect(canLinkItems(sections, 'a', 'x')).toBe(true);
  });

  it('never links an item to itself', () => {
    expect(canLinkItems(sections, 'a', 'a')).toBe(false);
  });

  it('never links an item to its own ancestor or descendant — nesting already is that', () => {
    expect(canLinkItems(sections, 'a', 'a1')).toBe(false);
    expect(canLinkItems(sections, 'a1', 'a')).toBe(false);
  });

  it('refuses an item that is nowhere on the sheet', () => {
    expect(canLinkItems(sections, 'ghost', 'b')).toBe(false);
    expect(canLinkItems(sections, 'a', 'ghost')).toBe(false);
  });
});

describe('duplicates and pruning', () => {
  const edges = [
    edge('e1', 'a', 'end', 'b', 'start'),
    edge('e2', 'a', 'start', 'b', 'start'),
    edge('e3', 'b', 'end', 'c', 'start'),
  ];

  it('an exact anchor pairing is a duplicate; a different pairing is not', () => {
    expect(isDuplicateEdge(edges, 'a', 'end', 'b', 'start')).toBe(true);
    expect(isDuplicateEdge(edges, 'a', 'end', 'b', 'end')).toBe(false);
  });

  it('edgesTouching and pruneEdgesTouching split on the same set', () => {
    const ids = new Set(['a']);
    expect(edgesTouching(edges, ids).map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(pruneEdgesTouching(edges, ids).map((e) => e.id)).toEqual(['e3']);
  });

  it('pruneEdgesTouching returns the same array when nothing matches', () => {
    expect(pruneEdgesTouching(edges, new Set(['zzz']))).toBe(edges);
  });

  it('pruneDanglingEdges drops edges whose items are gone', () => {
    const sections = [
      section('s1', [bar('a', '2026-01-01', '2026-02-01'), bar('b', '2026-02-01', '2026-03-01')]),
    ];
    expect(pruneDanglingEdges(edges, sections).map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('edgesWithinSection keeps only fully on-board links', () => {
    const s = section('s1', [
      bar('a', '2026-01-01', '2026-02-01'),
      bar('b', '2026-02-01', '2026-03-01'),
    ]);
    expect(edgesWithinSection(edges, s).map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});

describe('remapEdgeItemIds', () => {
  it('follows the item id map and drops edges it cannot follow', () => {
    const edges = [edge('e1', 'a', 'end', 'b', 'start'), edge('e2', 'a', 'end', 'gone', 'start')];
    const idMap = new Map([
      ['a', 'A'],
      ['b', 'B'],
    ]);
    let n = 0;
    const remapped = remapEdgeItemIds(edges, idMap, () => `new-${(n += 1)}`);
    expect(remapped).toHaveLength(1);
    expect(remapped[0]).toMatchObject({ id: 'new-1', from: 'A', to: 'B' });
  });
});

describe('readStoredEdges', () => {
  it('keeps well-formed edges and drops everything else', () => {
    const stored = [
      edge('e1', 'a', 'end', 'b', 'start'),
      { id: 'bad-anchor', from: 'a', fromAnchor: 'middle', to: 'b', toAnchor: 'start' },
      { id: 'self', from: 'a', fromAnchor: 'end', to: 'a', toAnchor: 'start' },
      'not an edge',
      null,
    ];
    expect(readStoredEdges(stored).map((e) => e.id)).toEqual(['e1']);
    expect(readStoredEdges('garbage')).toEqual([]);
    expect(readStoredEdges(undefined)).toEqual([]);
  });
});
