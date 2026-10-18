import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ExportModal } from '../components/layout/ExportModal';
import { downloadProjectJson, downloadScheduleFloid } from '../utils/exportUtils';
import { saveFile } from '../platform/files';
import { setAppSettings } from '../utils/indexedDB';
import { useUIStore } from '../stores/uiStore';
import { useProjectStore } from '../stores/projectStore';
import { useSectionStore } from '../stores/sectionStore';
import type { Project, Section } from '../types';

vi.mock('../utils/indexedDB', () => ({
  setAppSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../platform/files', () => ({
  saveFile: vi.fn(),
  supportsDirectorySave: () => false,
  pickDirectory: vi.fn(),
  writeFileInDirectory: vi.fn(),
}));

const project: Project = {
  id: 'p',
  name: 'Atlas',
  pinnedSectionId: null,
  projectStartDate: '2026-01-01',
  projectEndDate: '2026-12-31',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const section: Section = {
  id: 's',
  name: 'Design',
  type: 'schedule',
  revision: 1,
  lastModifiedAt: '2026-01-01T00:00:00.000Z',
  order: 0,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  items: [],
  color: '#333333',
  isCollapsed: false,
};

/** A cancelled native save dialog (the Mac app) writes nothing. */
describe('a cancelled save dialog', () => {
  beforeEach(() => {
    vi.mocked(saveFile).mockResolvedValue({ saved: false });
    vi.mocked(setAppSettings).mockClear();
  });

  afterEach(() => {
    cleanup();
    useUIStore.setState({ isExportModalOpen: false });
  });

  it('reports the project backup as not saved, and does not stamp it', async () => {
    expect(await downloadProjectJson(project, [section])).toBe(false);
    expect(setAppSettings).not.toHaveBeenCalled();
  });

  it('reports a schedule as not saved', async () => {
    expect(await downloadScheduleFloid(project, section)).toBe(false);
  });

  it('shows no "Exported" toast and leaves the dialog open', async () => {
    useProjectStore.setState({ project, projects: [], activeProjectId: 'p' });
    useSectionStore.setState({ sections: [section], dependencies: [] });
    useUIStore.setState({ isExportModalOpen: true, exportModalProjectId: null });
    useUIStore.setState((s) => ({ toast: { ...s.toast, isVisible: false, message: '' } }));
    render(<ExportModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());

    expect(useUIStore.getState().toast.isVisible).toBe(false);
    expect(useUIStore.getState().isExportModalOpen).toBe(true);
  });

  it('still says so when the file was saved', async () => {
    vi.mocked(saveFile).mockResolvedValue({ saved: true });
    useProjectStore.setState({ project, projects: [], activeProjectId: 'p' });
    useSectionStore.setState({ sections: [section], dependencies: [] });
    useUIStore.setState({ isExportModalOpen: true, exportModalProjectId: null });
    render(<ExportModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(useUIStore.getState().toast.message).toBe('Exported "Atlas"'));
    expect(useUIStore.getState().isExportModalOpen).toBe(false);
  });
});
