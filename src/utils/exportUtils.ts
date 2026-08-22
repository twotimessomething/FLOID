import type { Project } from '../types/project';
import type { DependencyEdge, Section, TimelineItem } from '../types/timeline';
import type { LegacySection } from '../types/legacy';
import type {
  ImportAnalysis,
  ProjectExportData,
  ScheduleExportData,
} from '../types/scheduleExport';
import { computeViewportBounds, getMonthMarkers, getSectionsDateRange } from './dateUtils';
import { dayKeyDiff, normalizeDayKey, toDayKey, todayKey } from './dayKeys';
import { migrateSections } from './migrateLegacy';
import { edgesWithinSection, pruneDanglingEdges, readStoredEdges } from './dependencyUtils';
import { flattenSection, headerMilestones, type FlatRow } from './timelineUtils';
import { setAppSettings } from './indexedDB';
import { sanitizeFilename } from './stringUtils';
import { getReadableTextColor } from './colorUtils';
import {
  IMAGE_WIDTH,
  IMAGE_HEIGHT,
  IMAGE_PADDING,
  LABEL_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  NESTED_ROW_HEIGHT,
  BAR_HEIGHT,
  NESTED_BAR_HEIGHT,
  NESTED_BAR_ALPHA,
} from '../constants/exportDimensions';

/**
 * Reading and writing files.
 *
 * Items hold absolute dates, so a written file is the item tree as it stands —
 * no field-by-field rebuild on either side, which is what used to drop whatever
 * the format had not been taught about. Anything older than the item model is
 * handed to `migrateLegacy` on the way in and is v3 by the time it is returned.
 */

/** Loosely typed view of a parsed project file, whatever version wrote it. */
interface RawProjectFile {
  readonly format?: unknown;
  readonly version?: unknown;
  readonly exportedAt?: unknown;
  readonly project?: {
    readonly id?: string;
    readonly name?: string;
    readonly pinnedSectionId?: string | null;
    readonly masterSectionId?: string;
    readonly projectStartDate?: string;
    readonly projectEndDate?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
  };
  readonly sections?: unknown;
  readonly dependencies?: unknown;
}

/** Loosely typed view of a parsed `.floid` file, v2 or v3. */
interface RawScheduleFile {
  readonly format?: unknown;
  readonly version?: unknown;
  readonly exportedAt?: unknown;
  readonly sourceProjectId?: string;
  readonly sourceProjectName?: string;
  readonly schedule?: {
    readonly id?: string;
    readonly name?: string;
    readonly templateId?: string;
    readonly revision?: number;
    readonly lastModifiedAt?: string;
    readonly color?: string;
    readonly isMulticolor?: boolean;
    readonly isLocked?: boolean;
  };
  readonly projectDates?: { readonly startDate?: string; readonly endDate?: string };
  readonly scheduleDates?: { readonly startDate?: string; readonly endDate?: string };
  readonly items?: unknown;
  readonly phases?: unknown;
  readonly milestones?: unknown;
  readonly dependencies?: unknown;
}

// ---------------------------------------------------------------------------
// Full project — .floid
// ---------------------------------------------------------------------------

export const exportProjectToJson = (
  project: Project,
  sections: Section[],
  dependencies: readonly DependencyEdge[] = []
): ProjectExportData => ({
  format: 'floid-project',
  version: '3.0',
  exportedAt: new Date().toISOString(),
  project: {
    id: project.id,
    name: project.name,
    pinnedSectionId: project.pinnedSectionId,
    projectStartDate: project.projectStartDate,
    projectEndDate: project.projectEndDate,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  },
  sections,
  dependencies,
});

export const exportToJson = (
  project: Project,
  sections: Section[],
  dependencies: readonly DependencyEdge[] = []
): string => JSON.stringify(exportProjectToJson(project, sections, dependencies), null, 2);

export const downloadProjectJson = async (
  project: Project,
  sections: Section[],
  dependencies: readonly DependencyEdge[] = []
): Promise<void> => {
  const json = exportToJson(project, sections, dependencies);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = `${sanitizeFilename(project.name)}.floid`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Update last backup date
  await setAppSettings({ lastBackupDate: new Date().toISOString() });
};

/**
 * Read a project file: v3.0, v2.0, and the numeric `version: 2` shape that
 * predates the string versions. Everything comes back as v3.0.
 */
export const parseProjectJson = (json: string): ProjectExportData | null => {
  try {
    const raw = JSON.parse(json) as RawProjectFile;

    const isTagged = raw.format === 'floid-project' && (raw.version === '3.0' || raw.version === '2.0');
    const isNumbered = raw.version === 2;
    if (!isTagged && !isNumbered) throw new Error('Unknown format');

    const rawProject = raw.project;
    if (!rawProject || !Array.isArray(raw.sections)) throw new Error('Missing project or sections');

    // Exports written before the pin model named the same schedule differently
    const pinnedSectionId = rawProject.pinnedSectionId ?? rawProject.masterSectionId ?? null;

    const sections = migrateSections(raw.sections).map((section) => ({
      ...section,
      // A master schedule always drew its phases in palette colours; a pinned one opts in
      isMulticolor: section.isMulticolor ?? (section.id === pinnedSectionId ? true : undefined),
    }));

    const derived = getSectionsDateRange(sections);

    return {
      format: 'floid-project',
      version: '3.0',
      // A pre-v4 file simply has none; a tampered list keeps what holds up
      dependencies: pruneDanglingEdges(readStoredEdges(raw.dependencies), sections),
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
      project: {
        id: rawProject.id ?? '',
        name: rawProject.name ?? 'Imported Project',
        pinnedSectionId,
        // Old files stored full ISO timestamps; the app compares day keys
        projectStartDate: normalizeDayKey(
          rawProject.projectStartDate ?? derived?.startDate ?? todayKey()
        ),
        projectEndDate: normalizeDayKey(rawProject.projectEndDate ?? derived?.endDate ?? todayKey()),
        createdAt: rawProject.createdAt ?? new Date().toISOString(),
        updatedAt: rawProject.updatedAt ?? new Date().toISOString(),
      },
      sections,
    };
  } catch (error) {
    console.error('Failed to parse project JSON:', error);
    return null;
  }
};

/** Turn a parsed file back into the runtime shapes the stores hold. */
export const convertImportedProject = (
  data: ProjectExportData
): { project: Project; sections: Section[]; dependencies: DependencyEdge[] } => {
  const project: Project = {
    id: data.project.id,
    name: data.project.name,
    pinnedSectionId: data.project.pinnedSectionId ?? data.project.masterSectionId ?? null,
    projectStartDate: data.project.projectStartDate,
    projectEndDate: data.project.projectEndDate,
    createdAt: data.project.createdAt,
    updatedAt: data.project.updatedAt,
  };

  // Migrating again is a no-op on v3 sections, and covers a caller that built
  // the export data by hand rather than through parseProjectJson.
  const sections = migrateSections(data.sections);
  return {
    project,
    sections,
    dependencies: pruneDanglingEdges(readStoredEdges(data.dependencies), sections),
  };
};

// ---------------------------------------------------------------------------
// Single schedule — .floid
// ---------------------------------------------------------------------------

export const exportScheduleToFloid = (
  project: Project,
  section: Section,
  dependencies: readonly DependencyEdge[] = []
): ScheduleExportData => ({
  format: 'floid',
  version: '3.0',
  exportedAt: new Date().toISOString(),
  sourceProjectId: project.id,
  sourceProjectName: project.name,
  // A share carries only what travels whole: links with both ends on board
  dependencies: edgesWithinSection(dependencies, section),
  schedule: {
    id: section.id,
    name: section.name,
    templateId: section.templateId,
    revision: section.revision,
    lastModifiedAt: section.lastModifiedAt,
    color: section.color,
    isMulticolor: section.isMulticolor,
    isLocked: section.isLocked,
  },
  projectDates: {
    startDate: project.projectStartDate,
    endDate: project.projectEndDate,
  },
  scheduleDates: {
    startDate: section.startDate,
    endDate: section.endDate,
  },
  items: section.items,
});

/**
 * A single schedule is a share, not a backup — it leaves every project sitting
 * unwritten in IndexedDB, so it deliberately does not stamp `lastBackupDate`.
 * Only `downloadProjectJson` may claim the project is backed up.
 */
export const downloadScheduleFloid = async (
  project: Project,
  section: Section,
  dependencies: readonly DependencyEdge[] = []
): Promise<void> => {
  const data = exportScheduleToFloid(project, section, dependencies);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = `${sanitizeFilename(project.name)}_${sanitizeFilename(section.name)}_r${section.revision}.floid`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * One reader for both wire versions. A v2 file carries `phases`/`milestones`
 * and a v3 file carries `items`, which is exactly the test the legacy migration
 * already makes — so the file is handed over as a section and read back.
 */
const readScheduleItems = (raw: RawScheduleFile): TimelineItem[] => {
  const candidate: Partial<LegacySection> & { items?: unknown } = {
    id: raw.schedule?.id,
    name: raw.schedule?.name,
    color: raw.schedule?.color,
    startDate: raw.scheduleDates?.startDate,
    endDate: raw.scheduleDates?.endDate,
    items: raw.items,
    phases: raw.phases as LegacySection['phases'],
    milestones: raw.milestones as LegacySection['milestones'],
  };
  const [section] = migrateSections([candidate]);
  return section.items;
};

export const parseScheduleFloid = (json: string): ScheduleExportData | null => {
  try {
    const raw = JSON.parse(json) as RawScheduleFile;

    const hasContent = Array.isArray(raw.items) || Array.isArray(raw.phases);
    const isReadable =
      raw.format === 'floid' &&
      (raw.version === '3.0' || raw.version === '2.0') &&
      Boolean(raw.sourceProjectId) &&
      Boolean(raw.sourceProjectName) &&
      Boolean(raw.schedule?.id) &&
      Boolean(raw.schedule?.name) &&
      Boolean(raw.scheduleDates?.startDate) &&
      Boolean(raw.scheduleDates?.endDate) &&
      hasContent;

    if (!isReadable) throw new Error('Invalid .floid format');

    const schedule = raw.schedule as NonNullable<RawScheduleFile['schedule']>;
    const scheduleDates = raw.scheduleDates as NonNullable<RawScheduleFile['scheduleDates']>;
    const projectDates = raw.projectDates ?? scheduleDates;
    const items = readScheduleItems(raw);

    return {
      format: 'floid',
      version: '3.0',
      // A pre-v4 file has none; whatever the file claims is held to the items it carries
      dependencies: pruneDanglingEdges(readStoredEdges(raw.dependencies), [{ items }]),
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
      sourceProjectId: raw.sourceProjectId ?? '',
      sourceProjectName: raw.sourceProjectName ?? '',
      schedule: {
        id: schedule.id ?? '',
        name: schedule.name ?? '',
        templateId: schedule.templateId,
        revision: schedule.revision ?? 1,
        lastModifiedAt: schedule.lastModifiedAt ?? new Date().toISOString(),
        color: schedule.color ?? '#3b82f6',
        isMulticolor: schedule.isMulticolor,
        isLocked: schedule.isLocked,
      },
      projectDates: {
        startDate: normalizeDayKey(projectDates.startDate ?? scheduleDates.startDate ?? todayKey()),
        endDate: normalizeDayKey(projectDates.endDate ?? scheduleDates.endDate ?? todayKey()),
      },
      scheduleDates: {
        startDate: normalizeDayKey(scheduleDates.startDate ?? todayKey()),
        endDate: normalizeDayKey(scheduleDates.endDate ?? todayKey()),
      },
      items,
    };
  } catch (error) {
    console.error('Failed to parse .floid file:', error);
    return null;
  }
};

export const analyzeScheduleImport = (
  data: ScheduleExportData,
  project: Project,
  sections: Section[]
): ImportAnalysis => {
  // Check if an existing section with the same ID exists
  const existingById = sections.find((s) => s.id === data.schedule.id);

  // Check for name collision (same name, different ID)
  const existingByName = sections.find(
    (s) => s.name === data.schedule.name && s.id !== data.schedule.id
  );

  // Check date alignment with project
  const dateMismatch =
    data.scheduleDates.startDate !== project.projectStartDate ||
    data.scheduleDates.endDate !== project.projectEndDate;

  if (existingById) {
    const revisionDelta = data.schedule.revision - existingById.revision;

    if (revisionDelta > 0) {
      return {
        type: 'update-newer',
        existingSection: existingById,
        importData: data,
        dateMismatch,
        revisionDelta,
      };
    } else if (revisionDelta < 0) {
      return {
        type: 'update-older',
        existingSection: existingById,
        importData: data,
        dateMismatch,
        revisionDelta,
      };
    } else {
      return {
        type: 'update-same',
        existingSection: existingById,
        importData: data,
        dateMismatch,
        revisionDelta: 0,
      };
    }
  }

  if (existingByName) {
    return {
      type: 'name-collision',
      existingSection: existingByName,
      importData: data,
      dateMismatch,
    };
  }

  return {
    type: 'new-schedule',
    importData: data,
    dateMismatch,
  };
};

// ---------------------------------------------------------------------------
// Image — .png
// ---------------------------------------------------------------------------

/** The image is drawn tighter than the screen, but on the same two-step scale. */
const imageRowHeight = (depth: number): number => (depth === 0 ? ROW_HEIGHT : NESTED_ROW_HEIGHT);
const imageBarHeight = (depth: number): number => (depth === 0 ? BAR_HEIGHT : NESTED_BAR_HEIGHT);

/** A schedule with its rows, measured once and drawn from the same list. */
interface SectionPlan {
  readonly section: Section;
  readonly rows: readonly FlatRow[];
  readonly bodyHeight: number;
}

/** A PNG has nothing to click open, so everything is drawn expanded. */
const expandItems = (items: readonly TimelineItem[]): TimelineItem[] =>
  items.map((item) => ({ ...item, isCollapsed: false, children: expandItems(item.children) }));

const expandSection = (section: Section): Section => ({
  ...section,
  isCollapsed: false,
  items: expandItems(section.items),
});

/**
 * Draw the whole timeline to a 1920x1080 PNG.
 *
 * The rows come from `flattenSection`, the same function the screen lays out
 * with, so an item nested four deep needs nothing added here — it arrives with
 * its depth and its resolved colour already worked out.
 */
export const exportTimelineAsImage = async (
  project: Project,
  sections: Section[]
): Promise<void> => {
  const WIDTH = IMAGE_WIDTH;
  const HEIGHT = IMAGE_HEIGHT;
  const PADDING = IMAGE_PADDING;

  // Get CSS variable colors or use defaults
  const getColor = (varName: string, fallback: string): string => {
    if (typeof document === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value || fallback;
  };

  const colors = {
    surface: getColor('--color-surface', '#f0f0f0'),
    text: getColor('--color-text-primary', '#17171a'),
    textSecondary: getColor('--color-text-secondary', '#6a6a70'),
    textMuted: getColor('--color-text-muted', '#9e9ea4'),
    border: getColor('--color-border', '#dcdcdc'),
    gridline: getColor('--color-gridline', 'rgba(255, 255, 255, 0.85)'),
    milestoneLine: getColor('--color-milestone-line', 'rgba(23, 23, 26, 0.1)'),
    today: getColor('--color-today', '#f34e42'),
  };

  // Sort sections by order (pinned section first)
  const sortedSections = [...sections].sort((a, b) => {
    if (a.id === project.pinnedSectionId) return -1;
    if (b.id === project.pinnedSectionId) return 1;
    return a.order - b.order;
  });

  const plans: SectionPlan[] = sortedSections.map((section) => {
    const expanded = expandSection(section);
    const rows = flattenSection(expanded);
    const bodyHeight = rows.reduce((sum, row) => sum + imageRowHeight(row.depth), 0);
    return { section: expanded, rows, bodyHeight };
  });

  // Calculate total content height
  const totalHeight =
    HEADER_HEIGHT +
    plans.reduce((sum, plan) => sum + ROW_HEIGHT + plan.bodyHeight, 0) +
    PADDING;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }

  // Fill background
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Calculate viewport bounds from all sections
  const viewport = computeViewportBounds(plans.map((plan) => plan.section));
  const timelineWidth = WIDTH - LABEL_WIDTH - PADDING * 2;
  const timelineX = LABEL_WIDTH + PADDING;

  const xForKey = (key: string): number =>
    timelineX + (dayKeyDiff(viewport.startKey, key) / viewport.totalDays) * timelineWidth;

  // Calculate vertical scaling if content is taller than canvas
  const availableHeight = HEIGHT - HEADER_HEIGHT - PADDING * 2;
  const contentHeight = totalHeight - HEADER_HEIGHT;
  const verticalScale = contentHeight > availableHeight ? availableHeight / contentHeight : 1;
  const scaledSectionRowHeight = ROW_HEIGHT * verticalScale;

  const drawDiamond = (x: number, y: number, size: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.fill();
  };

  // Draw header with month markers
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);

  // Draw month markers
  const monthMarkers = getMonthMarkers(viewport.startDate, viewport.endDate);
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = colors.textSecondary;
  ctx.textAlign = 'center';

  for (const marker of monthMarkers) {
    const x = xForKey(toDayKey(marker.date));

    if (x >= timelineX && x <= timelineX + timelineWidth) {
      ctx.fillStyle = colors.textSecondary;
      ctx.fillText(marker.label, x, HEADER_HEIGHT - 15);

      // Draw vertical grid line — lighter than the ground, reads as a gap in the paper
      ctx.strokeStyle = colors.gridline;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_HEIGHT);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
  }

  // Draw year indicator, stacked above the first month label and sharing its
  // centre so the two read as one axis mark (matching TimelineHeader on screen)
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = colors.textMuted;
  ctx.textAlign = 'center';
  const firstMarker = monthMarkers[0];
  const yearX = firstMarker ? xForKey(toDayKey(firstMarker.date)) : timelineX;
  ctx.fillText(String(viewport.startDate.getFullYear()), yearX, HEADER_HEIGHT - 30);

  // Draw project title
  ctx.font = '600 16px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = colors.text;
  ctx.textAlign = 'left';
  ctx.fillText(project.name, PADDING, HEADER_HEIGHT - 18);

  // Draw sections
  let y = HEADER_HEIGHT + PADDING;

  for (const plan of plans) {
    const { section, rows } = plan;
    const isPinned = section.id === project.pinnedSectionId;
    const scaledBodyHeight = plan.bodyHeight * verticalScale;

    // Draw section label — the schedule is the parent of every row under it
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = colors.text;
    ctx.textAlign = 'left';
    const sectionLabel = section.name + (isPinned ? ' ★' : '');
    ctx.fillText(sectionLabel, PADDING, y + scaledSectionRowHeight / 2 + 4, LABEL_WIDTH - PADDING);

    // Root milestones sit on the schedule's own row and rule a line down past
    // its items; the pinned schedule's lines run the whole sheet, as on screen.
    const milestoneY = y + scaledSectionRowHeight / 2;
    const lineBottom = isPinned ? HEIGHT : y + scaledSectionRowHeight + scaledBodyHeight;

    for (const milestone of headerMilestones(section)) {
      const x = xForKey(milestone.start);
      const size = 6 * verticalScale;

      ctx.strokeStyle = colors.milestoneLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, milestoneY + size);
      ctx.lineTo(x, lineBottom);
      ctx.stroke();

      drawDiamond(x, milestoneY, size, milestone.color ?? section.color);

      ctx.font = `${Math.max(9 * verticalScale, 8)}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'left';
      ctx.fillText(milestone.name, x + size + 4, milestoneY + 3, 100);
    }

    y += scaledSectionRowHeight;

    // Draw every item row, at whatever depth it sits
    for (const row of rows) {
      const { item, depth, color } = row;
      const rowHeight = imageRowHeight(depth) * verticalScale;
      const centerY = y + rowHeight / 2;
      const indent = PADDING + 16 * (depth + 1);

      // Label in the left column, one step lighter and smaller per level down
      ctx.font = `${Math.max(10, 12 - depth)}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = depth === 0 ? colors.textSecondary : colors.textMuted;
      ctx.textAlign = 'left';
      ctx.fillText(item.name, indent, centerY + (depth === 0 ? 4 : 3), LABEL_WIDTH - indent - 4);

      if (item.kind === 'bar') {
        const left = xForKey(item.start);
        const width = Math.max(2, xForKey(item.end) - left);
        const barHeight = imageBarHeight(depth) * verticalScale;
        const barY = y + (rowHeight - barHeight) / 2;

        // Square corners, flat fill; nested bars wash back against their parent
        ctx.globalAlpha = depth === 0 ? 1 : NESTED_BAR_ALPHA;
        ctx.fillStyle = color;
        ctx.fillRect(left, barY, width, barHeight);
        ctx.globalAlpha = 1;

        // Name on the bar, matching the on-screen treatment
        const minLabelWidth = depth === 0 ? 40 : 30;
        if (item.name && width > minLabelWidth) {
          const size = depth === 0 ? 10 : 9;
          ctx.font = `${Math.max(size * verticalScale, size - 1)}px system-ui, -apple-system, sans-serif`;
          ctx.fillStyle = getReadableTextColor(color);
          ctx.textAlign = 'left';
          ctx.fillText(item.name, left + 6, barY + barHeight / 2 + 3, width - 12);
        }
      } else {
        const x = xForKey(item.start);
        const size = 4 * verticalScale;

        drawDiamond(x, centerY, size, color);

        ctx.font = `${Math.max(8 * verticalScale, 7)}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = colors.textMuted;
        ctx.textAlign = 'left';
        ctx.fillText(item.name, x + size + 2, centerY + 2, 60);
      }

      y += rowHeight;
    }
  }

  // Draw today line if in range
  const today = todayKey();
  if (today >= viewport.startKey && today <= viewport.endKey) {
    const todayX = xForKey(today);

    ctx.strokeStyle = colors.today;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(todayX, HEADER_HEIGHT);
    ctx.lineTo(todayX, HEIGHT);
    ctx.stroke();
  }

  // Draw label column border
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LABEL_WIDTH, 0);
  ctx.lineTo(LABEL_WIDTH, HEIGHT);
  ctx.stroke();

  // Convert to blob and download
  canvas.toBlob((blob) => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(project.name)}-timeline.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
};
