import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSectionStore } from '../stores/sectionStore';
import { useProjectStore } from '../stores/projectStore';
import { usePinnedSection } from '../hooks/usePinnedSection';
import { exportProjectToJson } from '../utils/exportUtils';
import type { Project, Section } from '../types';

function section(id: string, order: number): Section {
  return {
    id,
    name: id,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    items: [],
    color: '#333333',
    isCollapsed: false,
  };
}

const project: Project = {
  id: 'p',
  name: 'Pinned',
  pinnedSectionId: 'pinned',
  projectStartDate: '2026-01-01',
  projectEndDate: '2026-12-31',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * The pin lives in the project store and undo only rewinds the section store,
 * so deleting the pinned schedule has to leave the pin naming it — otherwise
 * Cmd+Z brings the schedule back unpinned.
 */
describe('deleting the pinned schedule', () => {
  beforeEach(() => {
    useProjectStore.setState({ project });
    useSectionStore.setState({ sections: [section('pinned', 0), section('other', 1)] });
    useSectionStore.temporal.getState().clear();
  });

  it('comes back pinned on undo', () => {
    expect(useSectionStore.getState().deleteSection('pinned').success).toBe(true);
    useSectionStore.temporal.getState().undo();

    expect(useSectionStore.getState().sections.map((s) => s.id)).toContain('pinned');
    expect(useProjectStore.getState().project.pinnedSectionId).toBe('pinned');
  });

  it('reads as no pin while the schedule is gone', () => {
    useSectionStore.getState().deleteSection('pinned');
    const { result } = renderHook(() => usePinnedSection());

    expect(result.current.pinnedSection).toBeUndefined();
    expect(result.current.unpinnedSections.map((s) => s.id)).toEqual(['other']);
  });

  it('does not write the dangling pin into a backup', () => {
    useSectionStore.getState().deleteSection('pinned');
    const data = exportProjectToJson(project, useSectionStore.getState().sections);

    expect(data.project.pinnedSectionId).toBeNull();
  });
});
