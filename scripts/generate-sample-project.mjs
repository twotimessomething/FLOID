/**
 * Write a realistic .floid-project for testing and for App Review.
 *
 * Two jobs, one file:
 *   • the smoke test needs something to double-click in Finder
 *   • App Review Information takes one attachment, and a reviewer who can
 *     open a populated timeline forms a far better impression than one who
 *     has to build one
 *
 * The data is a hardware programme because that is what FLOID is for — real
 * phase names, real overlaps, nesting, a pinned schedule whose milestones run
 * down the sheet, and one deliberately violated dependency so the danger ink
 * has something to print.
 *
 * Usage: node scripts/generate-sample-project.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, '..', 'docs', 'mac-app-store', 'Atlas Wearable v1.floid-project');

const STAMP = '2026-08-24T12:00:00.000Z';

/** Mirrors PHASE_COLORS in src/constants/colors.ts. */
const C = {
  teal: '#5BB5A9',
  blue: '#3264B3',
  orange: '#EA733E',
  indigo: '#3A3F76',
  plum: '#7A184B',
};

let n = 0;
const id = (prefix) => `${prefix}-${(n += 1).toString(36).padStart(3, '0')}`;

const bar = (name, start, end, children = [], extra = {}) => ({
  id: id('item'),
  kind: 'bar',
  name,
  description: '',
  start,
  end,
  color: null,
  isCollapsed: false,
  children,
  ...extra,
});

const milestone = (name, day, extra = {}) => ({
  id: id('item'),
  kind: 'milestone',
  name,
  description: '',
  start: day,
  end: day,
  color: null,
  isCollapsed: false,
  children: [],
  ...extra,
});

const schedule = (name, color, startDate, endDate, order, items, extra = {}) => ({
  id: id('sec'),
  name,
  type: 'schedule',
  revision: 1,
  lastModifiedAt: STAMP,
  order,
  startDate,
  endDate,
  items,
  color,
  isCollapsed: false,
  ...extra,
});

// ── The programme spine. Root milestones on a pinned schedule draw reference
//    lines down through every other schedule, which is the whole point of it.
const programme = schedule('Programme', C.indigo, '2026-09-01', '2027-06-30', 0, [
  milestone('Kickoff', '2026-09-07'),
  milestone('EVT build', '2026-12-14'),
  milestone('DVT build', '2027-02-22'),
  milestone('PVT build', '2027-04-19'),
  milestone('Mass production', '2027-06-14'),
]);

const conceptLock = milestone('Concept lock', '2026-10-16');
const refinement = bar('Refinement', '2026-10-19', '2026-12-11', [
  bar('CMF studies', '2026-10-19', '2026-11-13'),
  bar('Appearance models', '2026-11-09', '2026-12-11'),
]);
const designSupport = bar('Design support', '2026-12-14', '2027-02-26');

const design = schedule('Industrial Design', C.teal, '2026-09-01', '2027-02-28', 1, [
  bar('Concept', '2026-09-07', '2026-10-16', [
    bar('Sketch exploration', '2026-09-07', '2026-09-25'),
    bar('Foam models', '2026-09-21', '2026-10-09'),
    conceptLock,
  ]),
  refinement,
  designSupport,
]);

const dvt = bar('DVT', '2027-01-18', '2027-03-19', [
  bar('Design validation', '2027-01-18', '2027-02-19'),
  bar('Regulatory pre-scan', '2027-02-08', '2027-03-19'),
]);

const engineering = schedule('Engineering', C.blue, '2026-09-14', '2027-05-29', 2, [
  bar('Architecture', '2026-09-14', '2026-10-30', [
    bar('Board bring-up', '2026-09-14', '2026-10-16'),
    bar('Battery sizing', '2026-10-05', '2026-10-30'),
  ]),
  bar('EVT', '2026-11-02', '2027-01-15', [
    bar('Firmware alpha', '2026-11-02', '2026-12-11'),
    bar('Thermal validation', '2026-11-30', '2027-01-15'),
  ]),
  dvt,
  // Folded on purpose: the slide export honours collapse state, so this is
  // also the case that proves it.
  bar('PVT', '2027-03-22', '2027-05-29', [
    bar('Pilot run', '2027-03-22', '2027-04-23'),
    bar('Yield tuning', '2027-04-19', '2027-05-29'),
  ], { isCollapsed: true }),
]);

const supplierLock = milestone('Supplier lock', '2026-12-11');
const supplierSelection = bar('Supplier selection', '2026-11-02', '2026-12-04');
const toolCutting = bar('Tool cutting', '2026-12-14', '2027-03-05');

const tooling = schedule('Tooling & Supply', C.orange, '2026-11-02', '2027-06-30', 3, [
  supplierSelection,
  supplierLock,
  toolCutting,
  bar('First shots', '2027-03-08', '2027-04-02'),
  bar('Ramp', '2027-05-03', '2027-06-26'),
]);

const marketing = schedule('Marketing', C.plum, '2027-01-04', '2027-06-30', 4, [
  bar('Positioning', '2027-01-04', '2027-02-12'),
  bar('Asset production', '2027-02-15', '2027-04-16'),
  bar('Launch', '2027-04-19', '2027-06-30', [
    bar('Press briefings', '2027-04-19', '2027-05-14'),
    bar('Retail readiness', '2027-05-03', '2027-06-30'),
  ]),
]);

const sections = [programme, design, engineering, tooling, marketing];

/** The anchor pair *is* the dependency type — there is no separate field. */
const link = (from, to, fromAnchor = 'end', toAnchor = 'start') => ({
  id: id('dep'),
  from: from.id,
  fromAnchor,
  to: to.id,
  toAnchor,
});

const dependencies = [
  link(conceptLock, refinement),
  // start→start, not end→start: supplier selection runs alongside refinement
  // rather than after it, which is how hardware actually works. As end→start
  // this link would read as violated, and the file is meant to show exactly
  // one violation.
  link(refinement, supplierSelection, 'start', 'start'),
  link(supplierLock, toolCutting),
  // Deliberately violated: Design support ends 2027-02-26, but DVT starts
  // 2027-01-18 — the target begins before the source finishes, so this one
  // prints in danger ink. It is the case screenshot 03 wants.
  link(designSupport, dvt),
];

const doc = {
  format: 'floid-project',
  version: '3.0',
  exportedAt: STAMP,
  project: {
    id: id('proj'),
    name: 'Atlas Wearable v1',
    pinnedSectionId: programme.id,
    projectStartDate: '2026-09-01',
    projectEndDate: '2027-06-30',
    createdAt: STAMP,
    updatedAt: STAMP,
  },
  sections,
  dependencies,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 2));

// Info.plist declares two document types, so ship one of each — a smoke test
// that only opens .floid-project leaves the .floid association unproven.
const share = {
  format: 'floid',
  version: '3.0',
  exportedAt: STAMP,
  sourceProjectId: doc.project.id,
  sourceProjectName: doc.project.name,
  dependencies: [],
  schedule: {
    id: engineering.id,
    name: engineering.name,
    templateId: undefined,
    revision: engineering.revision,
    lastModifiedAt: engineering.lastModifiedAt,
    color: engineering.color,
    isMulticolor: engineering.isMulticolor,
    isLocked: engineering.isLocked,
    startDate: engineering.startDate,
    endDate: engineering.endDate,
    items: engineering.items,
  },
};
const shareOut = resolve(__dirname, '..', 'docs', 'mac-app-store', 'Atlas Engineering.floid');
writeFileSync(shareOut, JSON.stringify(share, null, 2));

const items = (list) => list.reduce((t, i) => t + 1 + items(i.children), 0);
console.log(`  ${out.split('/').slice(-2).join('/')}`);
console.log(`  ${sections.length} schedules · ${sections.reduce((t, s) => t + items(s.items), 0)} items · ${dependencies.length} dependencies (1 violated)`);
console.log(`  ${shareOut.split('/').slice(-2).join('/')}`);
console.log(`  1 schedule, for the .floid association`);
