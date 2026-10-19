import { describe, expect, it } from 'vitest';
import { uniqueName } from '../utils/uniqueName';
import { formatSpanLength } from '../utils/spanLength';
import { comboCaps, sentenceCase } from '../utils/shortcutKeys';

describe('uniqueName', () => {
  it('keeps a name nobody is using', () => {
    expect(uniqueName('Engineering', ['Industrial Design', 'Marketing'])).toBe('Engineering');
    expect(uniqueName('Schedule', [])).toBe('Schedule');
  });

  it('numbers a second and a third from 2', () => {
    expect(uniqueName('Industrial Design', ['Industrial Design'])).toBe('Industrial Design 2');
    expect(uniqueName('Schedule', ['Schedule', 'Schedule 2'])).toBe('Schedule 3');
  });

  it('fills the first free number rather than counting past a gap', () => {
    expect(uniqueName('Schedule', ['Schedule', 'Schedule 3'])).toBe('Schedule 2');
  });

  it('treats case and stray spaces as the same name', () => {
    expect(uniqueName('Engineering', ['engineering '])).toBe('Engineering 2');
    expect(uniqueName('Engineering', ['Engineering', 'ENGINEERING 2'])).toBe('Engineering 3');
  });
});

describe('formatSpanLength', () => {
  it('counts calendar days, so a clock change never adds one', () => {
    // US clocks fall back on Nov 1, 2026: a millisecond count makes this 93
    expect(formatSpanLength(new Date(2026, 9, 1), new Date(2026, 11, 1))).toBe('2 months');
    expect(formatSpanLength(new Date(2026, 9, 1), new Date(2026, 10, 15))).toBe('45 days');
  });

  it('says one day, not one days', () => {
    expect(formatSpanLength(new Date(2026, 9, 1), new Date(2026, 9, 2))).toBe('1 day');
  });

  it('reads a long window in months', () => {
    // 93 by the old millisecond count, 92 by the calendar: either way, a quarter
    expect(formatSpanLength(new Date(2026, 9, 1), new Date(2027, 0, 1))).toBe('3 months');
    expect(formatSpanLength(new Date(2026, 9, 1), new Date(2027, 9, 1))).toBe('12 months');
    expect(formatSpanLength(new Date(2026, 9, 1), new Date(2027, 0, 15))).toBe('3 months, 14 days');
    expect(formatSpanLength(new Date(2026, 9, 1), new Date(2027, 0, 2))).toBe('3 months, 1 day');
  });

  it('counts whole months from the start’s own day, the rest in days', () => {
    expect(formatSpanLength(new Date(2026, 11, 31), new Date(2027, 2, 31))).toBe('3 months');
    expect(formatSpanLength(new Date(2027, 0, 31), new Date(2027, 3, 30))).toBe('2 months, 30 days');
  });
});

describe('comboCaps', () => {
  it('runs a Mac combo together in ⌃⌥⇧⌘ order', () => {
    expect(comboCaps(['⌘', '⇧', 'Z'], true)).toEqual(['⇧⌘Z']);
    expect(comboCaps(['⌘', 'S'], true)).toEqual(['⌘S']);
    expect(comboCaps(['⌘', '⌥', '⌃', 'X'], true)).toEqual(['⌃⌥⌘X']);
  });

  it('names each key elsewhere, Ctrl for ⌘', () => {
    expect(comboCaps(['⌘', '⇧', 'Z'], false)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(comboCaps(['⌘', '='], false)).toEqual(['Ctrl', '=']);
    expect(comboCaps(['⇧', '⌥', '⌘', 'K'], false)).toEqual(['Ctrl', 'Alt', 'Shift', 'K']);
  });
});

describe('sentenceCase', () => {
  it('lowers every capitalised word after the first', () => {
    expect(sentenceCase('Zoom to Fit')).toBe('Zoom to fit');
    expect(sentenceCase('New Project…')).toBe('New project…');
    expect(sentenceCase('Show/Hide Projects Sidebar')).toBe('Show/hide projects sidebar');
  });

  it('leaves single words and all-caps names alone', () => {
    expect(sentenceCase('Open…')).toBe('Open…');
    expect(sentenceCase('Rate FLOID…')).toBe('Rate FLOID…');
  });
});
