import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadProjectJson, downloadScheduleFloid } from '../utils/exportUtils';
import { saveFile } from '../platform/files';
import { setAppSettings } from '../utils/indexedDB';
import type { Project, Section } from '../types';

vi.mock('../platform/files', () => ({
  saveFile: vi.fn(async () => ({ saved: true })),
}));

vi.mock('../utils/indexedDB', () => ({
  setAppSettings: vi.fn().mockResolvedValue(undefined),
}));

function makeProject(): Project {
  return {
    id: 'proj-1',
    name: 'Alpha Launch',
    pinnedSectionId: null,
    projectStartDate: '2025-01-01',
    projectEndDate: '2025-07-01',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeSection(): Section {
  return {
    id: 'sec-1',
    name: 'Design',
    type: 'schedule',
    revision: 3,
    lastModifiedAt: '2025-01-15T00:00:00.000Z',
    order: 0,
    startDate: '2025-01-01',
    endDate: '2025-07-01',
    items: [],
    color: '#3b82f6',
    isCollapsed: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveFile).mockResolvedValue({ saved: true });
});

describe('exports through the platform seam', () => {
  it('hands the project file to saveFile with its name and filter', async () => {
    await downloadProjectJson(makeProject(), [makeSection()]);

    expect(saveFile).toHaveBeenCalledOnce();
    const request = vi.mocked(saveFile).mock.calls[0][0];
    expect(request.suggestedName).toBe('alpha-launch.floid');
    expect(request.filters[0].extensions).toContain('floid');
  });

  it('stamps the backup date only when the save actually happened', async () => {
    await downloadProjectJson(makeProject(), [makeSection()]);
    expect(vi.mocked(setAppSettings).mock.calls[0][0]).toHaveProperty('lastBackupDate');

    vi.clearAllMocks();
    vi.mocked(saveFile).mockResolvedValue({ saved: false });
    await downloadProjectJson(makeProject(), [makeSection()]);
    expect(setAppSettings).not.toHaveBeenCalled();
  });

  it('a schedule export is a share, never a backup', async () => {
    await downloadScheduleFloid(makeProject(), makeSection());

    expect(saveFile).toHaveBeenCalledOnce();
    expect(vi.mocked(saveFile).mock.calls[0][0].suggestedName).toBe('alpha-launch_design_r3.floid');
    expect(setAppSettings).not.toHaveBeenCalled();
  });
});
