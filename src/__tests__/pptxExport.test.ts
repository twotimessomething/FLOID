import { describe, it, expect } from 'vitest';
import type { Project } from '../types/project';
import type { Section, TimelineItem } from '../types';
import { buildSlidePlan } from '../utils/slidePlan';
import { renderPlanToPptx } from '../utils/pptxExport';

/**
 * The layout is covered in `slidePlan.test.ts`; what is worth checking here is
 * that the plan still survives the trip through the OOXML writer — a .pptx is
 * a zip, so a file that does not start "PK" is one PowerPoint will not open.
 */

function bar(id: string, start: string, end: string, children: TimelineItem[] = []): TimelineItem {
  return {
    id,
    kind: 'bar',
    name: id,
    description: '',
    start,
    end,
    color: null,
    isCollapsed: false,
    children,
  };
}

const project: Project = {
  id: 'p1',
  name: 'Rangefinder X100',
  pinnedSectionId: null,
  projectStartDate: '2026-01-01',
  projectEndDate: '2026-12-31',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sections: Section[] = [
  {
    id: 's1',
    name: 'Industrial design',
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 0,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    color: '#5BB5A9',
    isCollapsed: false,
    items: [
      bar('Research', '2026-01-12', '2026-02-16'),
      bar('Concept', '2026-02-16', '2026-05-04', [bar('Sketch', '2026-02-16', '2026-03-16')]),
      {
        id: 'm',
        kind: 'milestone',
        name: 'Freeze',
        description: '',
        start: '2026-05-04',
        end: '2026-05-04',
        color: null,
        isCollapsed: false,
        children: [],
      },
    ],
  },
  {
    id: 's2',
    name: 'Engineering',
    type: 'schedule',
    revision: 1,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    order: 1,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    color: '#3264B3',
    // Folded, and its bars overlap — so the tape, and the paper edge each
    // strip is drawn with, go through the writer too
    isCollapsed: true,
    items: [
      bar('Architecture', '2026-02-02', '2026-06-01'),
      bar('Prototype', '2026-04-13', '2026-09-07'),
      bar('Validation', '2026-08-03', '2026-11-30'),
    ],
  },
];

/** jsdom's Blob has no arrayBuffer(), so the bytes come back through a reader. */
const readBlob = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

describe('renderPlanToPptx', () => {
  it('writes a presentation PowerPoint can open', async () => {
    const plan = buildSlidePlan(project, sections, []);
    expect(plan.shapes.length).toBeGreaterThan(10);

    const bytes = await readBlob(await renderPlanToPptx(plan, 'Rangefinder X100'));

    // The zip local file header every .pptx starts with
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
    expect(bytes.length).toBeGreaterThan(10_000);
  }, 20_000);
});
