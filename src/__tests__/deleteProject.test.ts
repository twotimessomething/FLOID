import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteProjectAndOpenNext } from '../utils/deleteProject';
import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';
import type { DependencyEdge, Project, Section } from '../types';

const storage = vi.hoisted(() => ({
  records: new Map<
    string,
    { project: Project; sections: Section[]; dependencies: DependencyEdge[] }
  >(),
}));

vi.mock('../utils/storageUtils', () => ({
  loadProjectsIndex: vi.fn(async () => []),
  saveProjectsIndex: vi.fn(async () => undefined),
  loadProjectFromStorage: vi.fn(async (id: string) => storage.records.get(id) ?? null),
  saveProjectToStorage: vi.fn(async () => undefined),
  deleteProjectFromStorage: vi.fn(async (id: string) => {
    storage.records.delete(id);
  }),
  initializeStorage: vi.fn(async () => undefined),
}));

function makeProject(id: string): Project {
  return {
    id,
    name: id,
    pinnedSectionId: null,
    projectStartDate: '2026-01-01',
    projectEndDate: '2026-06-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeSection(id: string): Section {
  return {
    id,
    name: id,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-06-01',
    items: [],
    color: '#333333',
    isCollapsed: false,
  };
}

const sectionIds = (): string[] => useSectionStore.getState().sections.map((s) => s.id);

describe('deleting a project from the sidebar', () => {
  beforeEach(() => {
    storage.records.clear();
    for (const id of ['a', 'b']) {
      storage.records.set(id, {
        project: makeProject(id),
        sections: [makeSection(`saved-${id}`)],
        dependencies: [],
      });
    }
    useProjectStore.setState({
      project: makeProject('a'),
      activeProjectId: 'a',
      projects: [
        { id: 'a', name: 'a', updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', name: 'b', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    // The open project, with an edit autosave has not written yet
    useSectionStore.setState({ sections: [makeSection('saved-a')], dependencies: [] });
    useSectionStore.temporal.getState().clear();
    useSectionStore.getState().addSection('unsaved edit');
  });

  it('leaves the open project, its unsaved edits and its undo alone', async () => {
    const before = sectionIds();
    expect(await deleteProjectAndOpenNext('b')).toBe(false);

    expect(useProjectStore.getState().activeProjectId).toBe('a');
    expect(sectionIds()).toEqual(before);
    expect(useSectionStore.temporal.getState().pastStates.length).toBeGreaterThan(0);
  });

  it('opens the next project when the open one is deleted', async () => {
    expect(await deleteProjectAndOpenNext('a')).toBe(true);

    expect(useProjectStore.getState().activeProjectId).toBe('b');
    expect(sectionIds()).toEqual(['saved-b']);
  });

  it('clears the sheet when the last project goes', async () => {
    await deleteProjectAndOpenNext('b');
    expect(await deleteProjectAndOpenNext('a')).toBe(true);

    expect(useProjectStore.getState().activeProjectId).toBeNull();
    expect(sectionIds()).toEqual([]);
    expect(useSectionStore.temporal.getState().pastStates).toEqual([]);
  });
});
