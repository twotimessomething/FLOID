import { describe, it, expect } from 'vitest';
import type { Project, Section } from '../types';
import { legacyFilenameSlug, toFilename } from '../utils/stringUtils';
import {
  projectBackupFilename,
  projectFloidFilename,
  scheduleFloidFilename,
} from '../utils/exportUtils';

function project(name: string): Project {
  return {
    id: 'p1',
    name,
    pinnedSectionId: null,
    projectStartDate: '2026-01-01',
    projectEndDate: '2026-12-31',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function schedule(name: string): Section {
  return {
    id: 's1',
    name,
    type: 'schedule',
    revision: 3,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    items: [],
    color: '#333333',
    isCollapsed: false,
  };
}

describe('toFilename', () => {
  it('keeps a name as it was typed', () => {
    expect(toFilename('Café Q3 Launch')).toBe('Café Q3 Launch');
    expect(toFilename('新製品 🚀')).toBe('新製品 🚀');
    expect(toFilename('Aurora’s Speaker')).toBe('Aurora’s Speaker');
  });

  it('takes out only what a file system refuses', () => {
    expect(toFilename('Q3/Q4: "Launch" <beta>?')).toBe('Q3 Q4 Launch beta');
    expect(toFilename('a\\b|c*d')).toBe('a b c d');
    expect(toFilename('Line\u0000one\ttwo\nthree')).toBe('Line one two three');
  });

  it('never makes a hidden file or an empty name', () => {
    expect(toFilename('.hidden')).toBe('hidden');
    expect(toFilename(' .. config')).toBe('config');
    expect(toFilename('')).toBe('Untitled');
    expect(toFilename('   ')).toBe('Untitled');
    expect(toFilename('///')).toBe('Untitled');
  });
});

describe('export file names', () => {
  it('names a backup for the project and the day', () => {
    expect(projectBackupFilename(project('Aurora Speaker'), '2026-10-18')).toBe(
      'Aurora Speaker — Backup 2026-10-18.floid'
    );
  });

  it('names a schedule share for the project and the schedule', () => {
    expect(scheduleFloidFilename(project('Aurora Speaker'), schedule('Industrial Design'))).toBe(
      'Aurora Speaker — Industrial Design.floid'
    );
    expect(scheduleFloidFilename(project('新製品'), schedule(''))).toBe('新製品 — Untitled.floid');
  });

  it('keeps the folder autosave on the file it has always written', () => {
    // Changing this orphans every existing autosave file
    expect(projectFloidFilename(project('Alpha Launch'))).toBe('alpha-launch.floid');
    expect(projectFloidFilename(project('Café Q3 Launch'))).toBe('caf-q3-launch.floid');
    expect(legacyFilenameSlug('Café Q3 Launch')).toBe('caf-q3-launch');
  });
});
