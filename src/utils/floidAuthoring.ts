import { isValid, parse } from 'date-fns';
import { PHASE_COLORS, getScheduleColor } from '../constants/colors';
import { generateId } from './idUtils';
import { endAfterLastDay, maxDayKey, minDayKey } from './dayKeys';
import { canLinkItems, isDuplicateEdge } from './dependencyUtils';
import { forEachItem, itemsExtent } from './itemTree';
import type {
  DependencyAnchor,
  DependencyEdge,
  ItemKind,
  Section,
  TimelineItem,
} from '../types/timeline';

/**
 * The authoring format: a `.floid` written by a person or an LLM rather than
 * by FLOID.
 *
 * The wire format is the runtime model verbatim — ids everywhere, exclusive
 * bar ends, revision stamps — which is right for a round trip and hopeless to
 * write by hand. This one carries only what means something on the sheet:
 * names, kinds, inclusive dates, nesting and links. Everything else is
 * filled in here, so the only thing a writer can get wrong is the schedule
 * itself, and every way of getting that wrong comes back as a sentence that
 * names the item.
 *
 * It is a different `format`, not a looser reading of the old one, so
 * `importFloidText` can tell the two apart from the first field.
 */

export const AUTHORING_FORMAT = 'floid-authoring';

const KINDS: readonly ItemKind[] = ['bar', 'milestone', 'task'];

const LINK_TYPES = {
  'finish-to-start': { fromAnchor: 'end', toAnchor: 'start' },
  'start-to-start': { fromAnchor: 'start', toAnchor: 'start' },
  'finish-to-finish': { fromAnchor: 'end', toAnchor: 'end' },
} as const satisfies Record<string, { fromAnchor: DependencyAnchor; toAnchor: DependencyAnchor }>;

type LinkType = keyof typeof LINK_TYPES;

export interface AuthoredPlan {
  /** A name for a new project, if the document gave one. */
  readonly projectName: string | null;
  /** Fresh schedules, ordered from `firstOrder`, with every id minted here. */
  readonly sections: readonly Section[];
  readonly dependencies: readonly DependencyEdge[];
  /** Index into `sections` of the schedule the document asked to pin. */
  readonly pinnedIndex: number | null;
}

export type AuthoringResult =
  | { readonly ok: true; readonly plan: AuthoredPlan }
  | { readonly ok: false; readonly errors: readonly string[] };

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a parsed document is in the authoring format. */
export function isAuthoringDocument(value: unknown): boolean {
  return isObject(value) && value.format === AUTHORING_FORMAT;
}

/**
 * Pull the document out of whatever was pasted: a bare object, a fenced
 * ```json block in an AI's reply, or an object with prose either side of it.
 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [text.trim(), fenced?.[1]?.trim()];
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next reading
    }
  }
  return undefined;
}

/** A real calendar day, written 'yyyy-MM-dd'. */
function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isValid(parse(value, 'yyyy-MM-dd', new Date()));
}

/** A hex colour, or the name of one of the palette's inks ("teal"). */
function readColor(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return null;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  const named = (PHASE_COLORS as Record<string, string>)[value.trim().toLowerCase()];
  return named ?? null;
}

const COLOR_HINT = `a hex colour like "#3264B3" or one of: ${Object.keys(PHASE_COLORS).join(', ')}`;

interface ReadContext {
  readonly errors: string[];
  /** Author's id → minted id. */
  readonly ids: Map<string, string>;
  /** Item name (lower case) → minted ids carrying it, for links by name. */
  readonly names: Map<string, string[]>;
  /** The same, for items already in the project the document is joining. */
  readonly existingNames: Map<string, string[]>;
}

const describe = (where: string, name: unknown): string =>
  typeof name === 'string' && name.trim() ? `${where} “${name.trim()}”` : where;

function readItem(raw: unknown, where: string, context: ReadContext): TimelineItem | null {
  const { errors } = context;
  if (!isObject(raw)) {
    errors.push(`${where} must be an object.`);
    return null;
  }
  const label = describe(where, raw.name);

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) errors.push(`${label} needs a "name".`);

  const children = raw.children;
  const hasChildren = Array.isArray(children) && children.length > 0;
  // A missing kind is read from the shape: a span is a bar, a single date a milestone
  const kind: unknown =
    raw.kind ??
    (raw.end !== undefined || hasChildren ? 'bar' : raw.date !== undefined ? 'milestone' : 'bar');
  if (!KINDS.includes(kind as ItemKind)) {
    errors.push(`${label} has "kind": ${JSON.stringify(kind)}. Use "bar", "milestone" or "task".`);
    return null;
  }
  const itemKind = kind as ItemKind;

  let start = '';
  let end = '';
  if (itemKind === 'bar') {
    if (!isDayKey(raw.start)) errors.push(`${label} needs a "start" date written yyyy-MM-dd.`);
    if (!isDayKey(raw.end))
      errors.push(`${label} needs an "end" date written yyyy-MM-dd (its last day).`);
    if (isDayKey(raw.start) && isDayKey(raw.end)) {
      if (raw.end < raw.start) {
        errors.push(`${label} ends (${raw.end}) before it starts (${raw.start}).`);
      }
      start = raw.start;
      // Written as the last day covered; stored as the edge after it
      end = endAfterLastDay(raw.end);
    }
  } else {
    const day = raw.date ?? raw.start;
    if (!isDayKey(day)) {
      errors.push(`${label} is a ${itemKind} and needs a "date" written yyyy-MM-dd.`);
    } else {
      start = day;
      end = day;
    }
    if (hasChildren) {
      errors.push(
        `${label} is a ${itemKind}, so it cannot have "children". Only bars hold other items.`
      );
    }
  }
  if (children !== undefined && !Array.isArray(children)) {
    errors.push(`${label} has "children" that is not a list.`);
  }

  const color = readColor(raw.color);
  if (color === null)
    errors.push(`${label} has "color": ${JSON.stringify(raw.color)}. Use ${COLOR_HINT}.`);

  const id = generateId();
  if (raw.id !== undefined) {
    const authored = String(raw.id);
    if (context.ids.has(authored)) {
      errors.push(`${label} reuses the id "${authored}". Every id must be unique.`);
    } else {
      context.ids.set(authored, id);
    }
  }
  if (name) {
    const key = name.toLowerCase();
    context.names.set(key, [...(context.names.get(key) ?? []), id]);
  }

  const childItems =
    itemKind === 'bar' && Array.isArray(children)
      ? children
          .map((child, index) => readItem(child, `${label} › children[${index}]`, context))
          .filter((child): child is TimelineItem => child !== null)
      : [];

  return {
    id,
    kind: itemKind,
    name,
    description:
      typeof raw.notes === 'string'
        ? raw.notes
        : typeof raw.description === 'string'
          ? raw.description
          : '',
    start,
    end,
    color: color ?? null,
    isCollapsed: raw.collapsed === true,
    ...(raw.locked === true && { isLocked: true }),
    ...(itemKind === 'task' && { isDone: raw.done === true }),
    children: childItems,
  };
}

function readSchedule(
  raw: unknown,
  index: number,
  order: number,
  context: ReadContext
): Section | null {
  const where = `schedules[${index}]`;
  if (!isObject(raw)) {
    context.errors.push(`${where} must be an object.`);
    return null;
  }
  const label = describe(where, raw.name);
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) context.errors.push(`${label} needs a "name".`);

  const rawItems = raw.items ?? [];
  if (!Array.isArray(rawItems)) {
    context.errors.push(`${label} has "items" that is not a list.`);
    return null;
  }
  const items = rawItems
    .map((item, itemIndex) => readItem(item, `${label} › items[${itemIndex}]`, context))
    .filter((item): item is TimelineItem => item !== null);

  const color = readColor(raw.color);
  if (color === null)
    context.errors.push(`${label} has "color": ${JSON.stringify(raw.color)}. Use ${COLOR_HINT}.`);

  // The window is optional: without one it is simply the span of the work
  const extent = itemsExtent(items);
  const hasStart = raw.start !== undefined;
  const hasEnd = raw.end !== undefined;
  if (hasStart && !isDayKey(raw.start))
    context.errors.push(`${label} has a "start" that is not a yyyy-MM-dd date.`);
  if (hasEnd && !isDayKey(raw.end))
    context.errors.push(`${label} has an "end" that is not a yyyy-MM-dd date.`);
  const startDate = isDayKey(raw.start) ? raw.start : extent?.start;
  const endDate = isDayKey(raw.end) ? endAfterLastDay(raw.end) : extent?.end;
  if (!startDate || !endDate) {
    if (rawItems.length === 0) {
      context.errors.push(
        `${label} has no items. Give it some, or a "start" and "end" for an empty schedule.`
      );
    }
    return null;
  }

  return {
    id: generateId(),
    name,
    type: 'schedule',
    revision: 1,
    lastModifiedAt: new Date().toISOString(),
    order,
    startDate: minDayKey(startDate, endDate),
    endDate: maxDayKey(startDate, endDate),
    items,
    color: color ?? getScheduleColor(order),
    ...(raw.multicolor === true && { isMulticolor: true }),
    isCollapsed: raw.collapsed === true,
    ...(raw.locked === true && { isLocked: true }),
  };
}

/** An endpoint by the author's id, or else by a name only one item carries. */
function resolveEndpoint(
  ref: unknown,
  role: 'from' | 'to',
  where: string,
  context: ReadContext
): string | null {
  if (typeof ref !== 'string' || !ref.trim()) {
    context.errors.push(`${where} needs a "${role}": the id (or the name) of an item.`);
    return null;
  }
  const byId = context.ids.get(ref);
  if (byId) return byId;
  const key = ref.trim().toLowerCase();
  // The document's own items first; the project's only when it has none by that name
  const byName = context.names.get(key) ?? context.existingNames.get(key) ?? [];
  if (byName.length === 1) return byName[0];
  context.errors.push(
    byName.length > 1
      ? `${where} "${role}": "${ref}" names ${byName.length} items. Give them ids and link by id.`
      : `${where} "${role}": no item has the id or name "${ref}".`
  );
  return null;
}

function readDependencies(
  raw: unknown,
  /** Every schedule a link may reach: the project's and the document's. */
  sections: readonly Section[],
  context: ReadContext
): DependencyEdge[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    context.errors.push('"dependencies" must be a list.');
    return [];
  }
  const edges: DependencyEdge[] = [];
  raw.forEach((entry: unknown, index) => {
    const where = `dependencies[${index}]`;
    if (!isObject(entry)) {
      context.errors.push(`${where} must be an object.`);
      return;
    }
    const type = entry.type ?? 'finish-to-start';
    if (type === 'start-to-finish') {
      context.errors.push(
        `${where} is start-to-finish, which FLOID cannot draw. Leave it out, or use finish-to-start the other way round.`
      );
      return;
    }
    if (typeof type !== 'string' || !(type in LINK_TYPES)) {
      context.errors.push(
        `${where} has "type": ${JSON.stringify(type)}. Use "finish-to-start", "start-to-start" or "finish-to-finish".`
      );
      return;
    }
    const from = resolveEndpoint(entry.from, 'from', where, context);
    const to = resolveEndpoint(entry.to, 'to', where, context);
    if (!from || !to) return;
    if (from === to) {
      context.errors.push(`${where} links an item to itself.`);
      return;
    }
    // Nesting already is that relationship, so the sheet refuses the link
    if (!canLinkItems(sections, from, to)) {
      context.errors.push(
        `${where} links an item to a bar it sits inside. Nesting already says that; leave the link out.`
      );
      return;
    }
    const { fromAnchor, toAnchor } = LINK_TYPES[type as LinkType];
    if (isDuplicateEdge(edges, from, fromAnchor, to, toAnchor)) return;
    edges.push({ id: generateId(), from, fromAnchor, to, toAnchor });
  });
  return edges;
}

/**
 * Read an authoring document into fresh schedules and links. Every problem is
 * collected rather than stopping at the first, so one round trip to whoever
 * wrote it can fix them all.
 *
 * `existing` is the project the schedules will join. They go below it, which
 * picks the colours a schedule without one is given, and a link may name one
 * of its items — the work the new schedules have to line up with.
 */
export function readAuthoringDocument(
  doc: unknown,
  existing: readonly Section[] = []
): AuthoringResult {
  if (!isObject(doc)) {
    return {
      ok: false,
      errors: ['This isn’t a JSON object. Paste the whole reply, starting with {.'],
    };
  }
  if (doc.format !== AUTHORING_FORMAT) {
    return { ok: false, errors: [`The document needs "format": "${AUTHORING_FORMAT}".`] };
  }
  if (!Array.isArray(doc.schedules) || doc.schedules.length === 0) {
    return {
      ok: false,
      errors: ['The document needs a "schedules" list with at least one schedule.'],
    };
  }

  const existingNames = new Map<string, string[]>();
  forEachItem(
    existing.flatMap((section) => section.items),
    (item) => {
      const key = item.name.trim().toLowerCase();
      existingNames.set(key, [...(existingNames.get(key) ?? []), item.id]);
    }
  );

  const context: ReadContext = { errors: [], ids: new Map(), names: new Map(), existingNames };
  const sections = doc.schedules
    .map((schedule, index) => readSchedule(schedule, index, existing.length + index, context))
    .filter((section): section is Section => section !== null);
  const dependencies = readDependencies(doc.dependencies, [...existing, ...sections], context);

  if (context.errors.length > 0) return { ok: false, errors: context.errors };

  const pinned = (doc.schedules as unknown[]).findIndex((s) => isObject(s) && s.pinned === true);
  const projectName =
    typeof doc.project === 'string' && doc.project.trim() ? doc.project.trim() : null;

  return {
    ok: true,
    plan: { projectName, sections, dependencies, pinnedIndex: pinned === -1 ? null : pinned },
  };
}
