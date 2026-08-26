import type PptxGenJS from 'pptxgenjs';
import type { Project } from '../types/project';
import type { DependencyEdge, Section } from '../types/timeline';
import type { SlidePlan, SlidePoint, SlideShape } from './slidePlan';
import { buildSlidePlan } from './slidePlan';
import { sanitizeFilename } from './stringUtils';
import { saveFile } from '../platform/files';
import { POINTS_PER_INCH, SLIDE_FONT, SLIDE_INK } from '../constants/slideDimensions';

/**
 * The timeline as an editable PowerPoint slide.
 *
 * Every mark on the sheet arrives as a real shape: a bar is a rectangle with
 * its own text in it, a milestone is a diamond, a group is a span with a
 * terminal at each end. Nothing is an image, so the slide can be pulled apart
 * and re-coloured in PowerPoint like anything else drawn there.
 *
 * `slidePlan` decides where all of it goes; this file only speaks OOXML. The
 * split is what lets the layout be tested without a PowerPoint to open it in.
 */

const toIn = (points: number): number => points / POINTS_PER_INCH;

/** pptxgenjs is ~2.6MB unpacked, so it loads when someone actually exports. */
async function loadPptxGen(): Promise<typeof PptxGenJS> {
  const module = await import('pptxgenjs');
  return module.default;
}

/** A line runs from a corner of its box; which corner is the two flip flags. */
function addSegment(
  slide: PptxGenJS.Slide,
  from: SlidePoint,
  to: SlidePoint,
  color: string,
  width: number,
  dashed: boolean,
  arrow: boolean,
  name: string
): void {
  slide.addShape('line', {
    x: toIn(Math.min(from.x, to.x)),
    y: toIn(Math.min(from.y, to.y)),
    w: toIn(Math.abs(to.x - from.x)),
    h: toIn(Math.abs(to.y - from.y)),
    flipH: to.x < from.x,
    flipV: to.y < from.y,
    line: {
      color,
      width,
      dashType: dashed ? 'dash' : 'solid',
      endArrowType: arrow ? 'triangle' : 'none',
    },
    objectName: name,
  });
}

function renderShape(slide: PptxGenJS.Slide, shape: SlideShape): void {
  switch (shape.kind) {
    case 'rect': {
      // A rectangle with words in it is one object in PowerPoint, so the bar
      // and its name move, recolour and retype together.
      slide.addText(shape.text ?? '', {
        shape: 'rect',
        x: toIn(shape.x),
        y: toIn(shape.y),
        w: toIn(shape.w),
        h: toIn(shape.h),
        fill: { color: shape.fill, transparency: shape.transparency },
        line: shape.outline
          ? { color: shape.outline.color, width: shape.outline.width }
          : { type: 'none' },
        color: shape.textColor,
        fontFace: SLIDE_FONT,
        fontSize: shape.fontSize,
        align: 'left',
        valign: 'middle',
        margin: [0, 3, 0, 3],
        wrap: false,
        objectName: shape.name,
      });
      return;
    }

    case 'diamond':
    case 'dot': {
      slide.addShape(shape.kind === 'diamond' ? 'diamond' : 'ellipse', {
        x: toIn(shape.cx - shape.size / 2),
        y: toIn(shape.cy - shape.size / 2),
        w: toIn(shape.size),
        h: toIn(shape.size),
        fill: { color: shape.fill },
        line: { type: 'none' },
        objectName: shape.name,
      });
      return;
    }

    case 'polyline': {
      // Drawn segment by segment: PowerPoint has no polyline, and separate
      // lines are the more editable answer anyway. Only the last one carries
      // the arrowhead, and a corner that collapsed to nothing is skipped so it
      // cannot steal it.
      const drawn: Array<[SlidePoint, SlidePoint]> = [];
      for (let i = 0; i < shape.points.length - 1; i += 1) {
        const from = shape.points[i];
        const to = shape.points[i + 1];
        if (Math.abs(to.x - from.x) < 0.3 && Math.abs(to.y - from.y) < 0.3) continue;
        drawn.push([from, to]);
      }

      // A multi-segment line numbers its parts, so the selection pane does not
      // show one name four times over.
      drawn.forEach(([from, to], index) => {
        addSegment(
          slide,
          from,
          to,
          shape.color,
          shape.width,
          shape.dashed === true,
          shape.arrow === true && index === drawn.length - 1,
          drawn.length > 1 ? `${shape.name} · ${index + 1}` : shape.name
        );
      });
      return;
    }

    case 'text': {
      slide.addText(shape.text, {
        x: toIn(shape.x),
        y: toIn(shape.y),
        w: toIn(shape.w),
        h: toIn(shape.h),
        color: shape.color,
        fontFace: SLIDE_FONT,
        fontSize: shape.fontSize,
        bold: shape.bold,
        align: shape.align,
        valign: 'middle',
        margin: 0,
        wrap: false,
        isTextBox: true,
        objectName: shape.name,
      });
    }
  }
}

/** Build the file. Separate from the download so a test can hold the blob. */
export async function renderPlanToPptx(plan: SlidePlan, title: string): Promise<Blob> {
  const PptxGen = await loadPptxGen();
  const pptx = new PptxGen();

  pptx.layout = 'LAYOUT_WIDE'; // 13.333in x 7.5in — the modern 16:9 default
  pptx.title = title;

  const slide = pptx.addSlide();
  slide.background = { color: SLIDE_INK.paper };

  for (const shape of plan.shapes) {
    renderShape(slide, shape);
  }

  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

export interface PptxExportResult {
  /** Below 1 the rows were squeezed to hold one slide; worth telling the user. */
  readonly scale: number;
  readonly rowCount: number;
}

/**
 * Export the timeline exactly as it stands — folded schedules stay folded,
 * folded groups keep their children off the sheet — onto a single slide.
 */
export async function exportTimelineAsPptx(
  project: Project,
  sections: readonly Section[],
  dependencies: readonly DependencyEdge[] = []
): Promise<PptxExportResult> {
  const plan = buildSlidePlan(project, sections, dependencies);
  const blob = await renderPlanToPptx(plan, `${project.name} — timeline`);

  await saveFile({
    suggestedName: `${sanitizeFilename(project.name)}-timeline.pptx`,
    filters: [{ name: 'PowerPoint Slide', extensions: ['pptx'] }],
    data: blob,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });

  return { scale: plan.scale, rowCount: plan.rowCount };
}
