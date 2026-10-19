import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Project } from '../types';
import type * as WindowTitle from '../hooks/useWindowTitle';
import type { useProjectStore as ProjectStore } from '../stores/projectStore';

interface Loaded {
  readonly useWindowTitle: typeof WindowTitle.useWindowTitle;
  readonly projectWindowTitle: typeof WindowTitle.projectWindowTitle;
  readonly useProjectStore: typeof ProjectStore;
}

const SEARCH_TITLE = 'Free Product Development Scheduling & Timeline Software | FLOID';

function makeProject(name: string): Project {
  return {
    id: 'p1',
    name,
    pinnedSectionId: null,
    projectStartDate: '2026-01-01',
    projectEndDate: '2026-06-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** The hook reads index.html's title once, at import, so each test imports it fresh. */
async function load(): Promise<Loaded> {
  vi.resetModules();
  const { useWindowTitle, projectWindowTitle } = await import('../hooks/useWindowTitle');
  const { useProjectStore } = await import('../stores/projectStore');
  return { useWindowTitle, projectWindowTitle, useProjectStore };
}

beforeEach(() => {
  document.title = SEARCH_TITLE;
});

describe('projectWindowTitle', () => {
  it('names the project, then the app', async () => {
    const { projectWindowTitle } = await load();
    expect(projectWindowTitle('Alpha Launch')).toBe('Alpha Launch — FLOID');
  });

  it('still names something when the name is blank', async () => {
    const { projectWindowTitle } = await load();
    expect(projectWindowTitle('   ')).toBe('Untitled — FLOID');
  });
});

describe('useWindowTitle on the web', () => {
  it('keeps the search title until a project is open', async () => {
    const { useWindowTitle, useProjectStore } = await load();
    useProjectStore.setState({ activeProjectId: null });

    renderHook(() => useWindowTitle());
    expect(document.title).toBe(SEARCH_TITLE);

    act(() => useProjectStore.setState({ activeProjectId: 'p1', project: makeProject('Alpha') }));
    expect(document.title).toBe('Alpha — FLOID');

    act(() => useProjectStore.setState({ project: makeProject('Beta') }));
    expect(document.title).toBe('Beta — FLOID');
  });

  it('hands the search title back when the last project goes', async () => {
    const { useWindowTitle, useProjectStore } = await load();
    useProjectStore.setState({ activeProjectId: 'p1', project: makeProject('Alpha') });

    renderHook(() => useWindowTitle());
    expect(document.title).toBe('Alpha — FLOID');

    act(() => useProjectStore.setState({ activeProjectId: null }));
    expect(document.title).toBe(SEARCH_TITLE);
  });
});
