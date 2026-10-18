import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectStore } from '../stores/projectStore';
import type { Project, Section } from '../types';

const storage = vi.hoisted(() => ({
  records: new Map<string, { project: Project }>(),
  /** Each save waits here until the test lets it finish. */
  pending: [] as (() => void)[],
}));

vi.mock('../utils/storageUtils', () => ({
  loadProjectsIndex: vi.fn(async () => []),
  saveProjectsIndex: vi.fn(async () => undefined),
  loadProjectFromStorage: vi.fn(async (id: string) => storage.records.get(id) ?? null),
  saveProjectToStorage: vi.fn(
    (id: string, data: { project: Project }) =>
      new Promise<void>((resolve) => {
        storage.pending.push(() => {
          storage.records.set(id, data);
          resolve();
        });
      })
  ),
  deleteProjectFromStorage: vi.fn(async () => undefined),
  initializeStorage: vi.fn(async () => undefined),
}));

function makeProject(id: string, name: string, pinnedSectionId: string | null): Project {
  return {
    id,
    name,
    pinnedSectionId,
    projectStartDate: '2026-01-01',
    projectEndDate: '2026-06-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const finishPendingSaves = async (): Promise<void> => {
  while (storage.pending.length > 0) {
    storage.pending.shift()!();
    await flush();
  }
};

describe('saveCurrentProject', () => {
  const projectA = makeProject('a', 'Alpha', 'sec-a');
  const projectB = makeProject('b', 'Bravo', 'sec-b');
  const sections: Section[] = [];

  beforeEach(() => {
    storage.records.clear();
    storage.pending.length = 0;
    storage.records.set('b', { project: projectB });
    useProjectStore.setState({
      project: projectA,
      activeProjectId: 'a',
      projects: [
        { id: 'a', name: 'Alpha', updatedAt: projectA.updatedAt },
        { id: 'b', name: 'Bravo', updatedAt: projectB.updatedAt },
      ],
    });
  });

  it('does not put the old project back over one opened while it was saving', async () => {
    const saving = useProjectStore.getState().saveCurrentProject(sections, []);
    await useProjectStore.getState().selectProject('b');
    await finishPendingSaves();
    await saving;

    const { project, activeProjectId } = useProjectStore.getState();
    expect(activeProjectId).toBe('b');
    expect(project.name).toBe('Bravo');
    expect(project.pinnedSectionId).toBe('sec-b');
  });

  it('keeps an edit made while the save was in flight', async () => {
    const saving = useProjectStore.getState().saveCurrentProject(sections, []);
    useProjectStore.setState({ project: { ...projectA, name: 'Renamed' } });
    await finishPendingSaves();
    await saving;

    expect(useProjectStore.getState().project.name).toBe('Renamed');
  });

  it('leaves the project object alone when only the timestamp changed', async () => {
    const before = useProjectStore.getState().project;
    const saving = useProjectStore.getState().saveCurrentProject(sections, []);
    await finishPendingSaves();
    await saving;

    // A new object here re-arms autosave, which would save again forever
    expect(useProjectStore.getState().project).toBe(before);
    expect(storage.records.get('a')?.project.updatedAt).not.toBe(projectA.updatedAt);
  });
});
