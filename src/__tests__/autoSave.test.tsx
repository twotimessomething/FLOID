import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Project } from '../types';
import type { useUIStore as UIStore } from '../stores/uiStore';
import type { CommandId } from '../commands/types';

vi.mock('../commands/executeCommand', () => {
  const executeCommand = vi.fn();
  // The shared toast action, wired to the mock so the test can see it run
  return {
    executeCommand,
    BACK_UP_ACTION: { label: 'Back up', onClick: () => executeCommand('project.saveBackup') },
  };
});

interface Harness {
  readonly flushAutoSave: () => Promise<void>;
  readonly save: Mock<() => Promise<void>>;
  readonly showToast: Mock<ReturnType<typeof UIStore.getState>['showToast']>;
  readonly isSaveFailing: () => boolean;
  /** Something on the sheet changed — what does not matter, only that it did. */
  readonly edit: () => void;
  readonly useUIStore: typeof UIStore;
  readonly executeCommand: (id: CommandId) => void;
}

/** Autosave keeps module state, so every test gets a fresh copy of it and of the stores. */
async function setup(saveCurrentProject: () => Promise<void>): Promise<Harness> {
  vi.resetModules();
  const autoSave = await import('../hooks/useAutoSave');
  const { useProjectStore } = await import('../stores/projectStore');
  const { useSectionStore } = await import('../stores/sectionStore');
  const { useUIStore } = await import('../stores/uiStore');
  const { executeCommand } = await import('../commands/executeCommand');

  const project: Project = {
    id: 'p1',
    name: 'Alpha',
    pinnedSectionId: null,
    projectStartDate: '2026-01-01',
    projectEndDate: '2026-06-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const save = vi.fn(saveCurrentProject);
  useProjectStore.setState({
    project,
    projects: [{ id: 'p1', name: 'Alpha', updatedAt: project.updatedAt }],
    activeProjectId: 'p1',
    saveCurrentProject: save,
  });
  useSectionStore.setState({ sections: [], dependencies: [], isInitialized: true });
  const showToast = vi.fn(useUIStore.getState().showToast);
  useUIStore.setState({ showToast });

  renderHook(() => autoSave.useAutoSave());
  const health = renderHook(() => autoSave.useIsSaveFailing());

  return {
    flushAutoSave: autoSave.flushAutoSave,
    save,
    showToast,
    isSaveFailing: () => health.result.current,
    edit: () => {
      act(() => useSectionStore.setState({ sections: [] }));
    },
    useUIStore,
    executeCommand,
  };
}

const quotaError = (): Promise<void> =>
  Promise.reject(new DOMException('Quota exceeded', 'QuotaExceededError'));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a failed autosave', () => {
  it('says so once per streak, and the next save that lands ends it', async () => {
    let attempts = 0;
    const { save, showToast, isSaveFailing, edit, useUIStore, executeCommand } = await setup(() =>
      ++attempts <= 2 ? quotaError() : Promise.resolve()
    );

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    expect(isSaveFailing()).toBe(true);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toBe('error');
    expect(showToast.mock.calls[0][1]).toContain('Couldn’t save');

    // The streak goes on: another failure, no second toast
    edit();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(2);
    expect(showToast).toHaveBeenCalledTimes(1);

    // The remedy is the same Save Backup the menu runs
    useUIStore.getState().toast.action?.onClick();
    expect(executeCommand).toHaveBeenCalledWith('project.saveBackup');

    edit();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(3);
    expect(isSaveFailing()).toBe(false);
    expect(useUIStore.getState().toast.isVisible).toBe(false);
  });
});

describe('flushAutoSave', () => {
  it('writes a pending edit at once instead of waiting out the debounce', async () => {
    const { save, flushAutoSave } = await setup(() => Promise.resolve());

    await flushAutoSave();
    expect(save).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('has nothing to do once everything is written', async () => {
    const { save, flushAutoSave } = await setup(() => Promise.resolve());
    await act(() => vi.advanceTimersByTimeAsync(1000));

    await flushAutoSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('floid-project-p1')).toBeNull();
  });

  it('leaves the emergency copy when IndexedDB refuses the write', async () => {
    const { flushAutoSave } = await setup(quotaError);

    await expect(flushAutoSave()).resolves.toBeUndefined();
    expect(localStorage.getItem('floid-project-p1')).not.toBeNull();
  });

  it('stops waiting on a write that never finishes', async () => {
    const { flushAutoSave } = await setup(() => new Promise<void>(() => undefined));

    const flushing = flushAutoSave();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(flushing).resolves.toBeUndefined();
    expect(localStorage.getItem('floid-project-p1')).not.toBeNull();
  });
});
