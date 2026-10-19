import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ExportModal } from '../components/layout/ExportModal';
import { saveFile } from '../platform/files';
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

/** Return in the export dialog is its default button, wherever focus has no use for it. */
describe('Return in the export dialog', () => {
  beforeEach(() => {
    vi.mocked(saveFile).mockReset();
    vi.mocked(saveFile).mockResolvedValue({ saved: true });
    useProjectStore.setState({ project, projects: [], activeProjectId: 'p' });
    useSectionStore.setState({ sections: [section], dependencies: [] });
    useUIStore.setState({ isExportModalOpen: true, exportModalProjectId: null });
    render(<ExportModal />);
  });

  afterEach(() => {
    cleanup();
    useUIStore.setState({ isExportModalOpen: false });
  });

  it('exports from a radio, which does nothing with Return itself', async () => {
    const radio = screen.getAllByRole('radio')[0];
    radio.focus();
    fireEvent.keyDown(radio, { key: 'Enter' });
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
  });

  it('leaves a focused button to press itself', () => {
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.keyDown(cancel, { key: 'Enter' });
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('lets an input method keep the Return that confirms a candidate', () => {
    const radio = screen.getAllByRole('radio')[0];
    fireEvent.keyDown(radio, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(radio, { key: 'Enter', keyCode: 229 });
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('does nothing while there is nothing to export', () => {
    fireEvent.click(screen.getByRole('radio', { name: /Specific schedules/ }));
    const radio = screen.getByRole('radio', { name: /Specific schedules/ });
    fireEvent.keyDown(radio, { key: 'Enter' });
    expect(saveFile).not.toHaveBeenCalled();
  });
});
