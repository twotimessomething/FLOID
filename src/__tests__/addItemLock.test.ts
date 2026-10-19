import { beforeEach, describe, expect, it } from 'vitest';
import type { Section, TimelineItem } from '../types';
import { useSectionStore } from '../stores/sectionStore';
import { useUIStore } from '../stores/uiStore';
import { createBarAt } from '../utils/creationUtils';

function schedule(id: string, isLocked: boolean): Section {
  return {
    id,
    name: id,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items: [],
    color: '#333333',
    isCollapsed: false,
    isLocked,
  };
}

const NEW_BAR: Omit<TimelineItem, 'id' | 'children'> = {
  kind: 'bar',
  name: 'New',
  description: '',
  start: '2026-03-02',
  end: '2026-03-09',
  color: null,
  isCollapsed: false,
};

beforeEach(() => {
  useSectionStore.setState({ sections: [schedule('open', false), schedule('locked', true)] });
  useSectionStore.temporal.getState().clear();
});

describe('addItem on a locked schedule', () => {
  it('refuses, and leaves the schedule as it was', () => {
    const before = useSectionStore.getState().sections[1];
    expect(useSectionStore.getState().addItem('locked', null, NEW_BAR)).toBeNull();
    expect(useSectionStore.getState().sections[1]).toBe(before);
    expect(useSectionStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('still adds to a schedule that is not locked', () => {
    const id = useSectionStore.getState().addItem('open', null, NEW_BAR);
    expect(id).toEqual(expect.any(String));
    expect(useSectionStore.getState().sections[0].items.map((item) => item.id)).toEqual([id]);
  });
});

describe('creating on a locked schedule', () => {
  it('makes nothing, selects nothing and reports no id', () => {
    useUIStore.getState().clearSelection();
    const id = createBarAt('locked', { startDay: '2026-03-02' }, { x: 0, y: 0 });
    expect(id).toBeNull();
    expect(useSectionStore.getState().sections[1].items).toHaveLength(0);
    expect(useUIStore.getState().selection.id).toBeNull();
  });
});
