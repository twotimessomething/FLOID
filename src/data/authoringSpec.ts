import { PHASE_COLORS } from '../constants/colors';
import { AUTHORING_FORMAT } from '../utils/floidAuthoring';

/**
 * What an AI is told about building for FLOID.
 *
 * One text, two readers: the "Build with AI" prompt copies it to the
 * clipboard, and `public/llms-full.txt` carries it word for word for an AI
 * that finds FLOID on the web (a test holds the two together). The example
 * is a real document — the same test reads it through `readAuthoringDocument`
 * — so the spec cannot promise a shape the importer refuses.
 */

export const AUTHORING_EXAMPLE = {
  format: AUTHORING_FORMAT,
  project: 'Aurora Speaker',
  schedules: [
    {
      name: 'Product Development',
      pinned: true,
      items: [
        { kind: 'milestone', name: 'Kickoff', date: '2027-01-11' },
        { kind: 'milestone', name: 'Design Freeze', date: '2027-04-02' },
        { kind: 'milestone', name: 'Launch', date: '2027-09-14' },
      ],
    },
    {
      name: 'Industrial Design',
      color: 'teal',
      multicolor: true,
      items: [
        {
          id: 'concept',
          kind: 'bar',
          name: 'Concept',
          start: '2027-01-11',
          end: '2027-02-19',
          children: [
            { kind: 'bar', name: 'Research', start: '2027-01-11', end: '2027-01-22' },
            { kind: 'bar', name: 'Sketching', start: '2027-01-25', end: '2027-02-12' },
            { kind: 'task', name: 'Concept review', date: '2027-02-19' },
          ],
        },
        {
          id: 'cmf',
          kind: 'bar',
          name: 'CMF',
          start: '2027-02-22',
          end: '2027-04-02',
          notes: 'Two finishes',
        },
      ],
    },
    {
      name: 'Engineering',
      items: [
        { id: 'tooling', kind: 'bar', name: 'Tooling', start: '2027-04-05', end: '2027-06-25' },
        { id: 'evt', kind: 'milestone', name: 'EVT', date: '2027-07-02' },
      ],
    },
  ],
  dependencies: [
    { from: 'concept', to: 'cmf', type: 'finish-to-start' },
    { from: 'cmf', to: 'tooling' },
    { from: 'tooling', to: 'evt' },
  ],
} as const;

export const AUTHORING_SPEC = `## Building a FLOID schedule with AI

FLOID (https://floid.design) is a timeline tool for product development. It imports a JSON document in the format below. Reply with that document as a single \`\`\`json code block. FLOID reads only the JSON, so any text around it is ignored.

### The model

- A **project** holds one or more **schedules**: one track per team or workstream (Industrial Design, Engineering, Marketing…).
- A schedule holds **items**. There are three kinds:
  - **bar**: a span of work, from a start date to an end date. Bars can hold child items, nested as deep as needed. A bar with children is a phase or group.
  - **milestone**: a single date, such as a gate, review, freeze or launch.
  - **task**: a single date that can be ticked off when it is done.
- **Dependencies** link two items. They record an order and FLOID shows when it is broken. They never move anything.

### Document

\`\`\`
{
  "format": "${AUTHORING_FORMAT}",        // required, exactly this
  "project": "Project name",          // optional, names a new project
  "schedules": [ Schedule, ... ],     // required, at least one
  "dependencies": [ Link, ... ]       // optional
}
\`\`\`

**Schedule**
- \`name\` (required)
- \`items\` (required): a list of Items, top to bottom in the order they should appear
- \`color\` (optional): a hex colour like "#3264B3", or one of: ${Object.keys(PHASE_COLORS).join(', ')}. Leave it out and FLOID picks one.
- \`multicolor\` (optional, true/false): give each top-level bar its own palette colour instead of shades of the schedule's colour
- \`pinned\` (optional, true on at most one schedule): draws this schedule on top, and its top-level milestones become reference lines through every schedule. Use it for a master or gate schedule.
- \`start\`, \`end\` (optional): the schedule's own window. Leave them out and it spans its items.

**Item**
- \`kind\` (required): "bar", "milestone" or "task"
- \`name\` (required): short, as it should be printed on the bar
- Bars: \`start\` and \`end\`. \`end\` is the **last day** of the work, inclusive: a one-day bar has start = end.
- Milestones and tasks: \`date\`
- \`children\` (bars only, optional): nested Items. A child keeps its own dates and may sit anywhere in time.
- \`id\` (optional): any unique string. It is only needed for a dependency to point at the item.
- \`color\` (optional): as for schedules. Usually leave it out; children inherit their parent's colour.
- \`notes\` (optional): longer description text
- \`done\` (tasks only, optional, true/false)

All dates are written \`yyyy-MM-dd\`. Every item carries real calendar dates; nothing is relative to its parent.

**Link**
- \`from\`, \`to\` (required): an item's \`id\`, or its \`name\` if that name is unique. When adding to an existing project, a link may also name an item already in it.
- \`type\` (optional): "finish-to-start" (default: \`to\` starts after \`from\` finishes), "start-to-start", or "finish-to-finish". There is no start-to-finish.
- Links may cross schedules. Never link an item to a bar it is nested inside; nesting already says that.

### Good schedules

- One schedule per team or workstream; three to eight is typical. Use a pinned schedule of milestones for the gates everyone works to.
- Group related work under a parent bar, such as Concept, Detail Design or Validation, instead of one long flat list.
- Put milestones at the moments a decision is made or work is handed over. Use tasks for small checkable deliverables.
- Unless told otherwise, start and end work on weekdays.
- Keep names short; the schedule and the parent already give context.

### Converting from other software

- Summary tasks or phases become bars with \`children\`.
- Zero-duration tasks become milestones.
- Checklist items or to-dos tied to a date become tasks. Set \`done\` if they are complete.
- Predecessors: FS becomes "finish-to-start", SS "start-to-start", FF "finish-to-finish". SF cannot be drawn: leave it out and say so. Lag cannot be stored: keep the real dates and drop the lag.
- Resource, cost, percent-complete and assignee columns have no place in FLOID. Put anything worth keeping in \`notes\`.
- Keep the source's real dates. If an end date is exclusive (the morning after), subtract a day.

### Example

\`\`\`json
${JSON.stringify(AUTHORING_EXAMPLE, null, 2)}
\`\`\`

If FLOID reports problems with a document, it lists each one by schedule and item name. Fix exactly those and send the whole document again.
`;

/** An item already on the sheet, as the AI is told about it. Dates as a person reads them. */
export interface PromptItem {
  readonly name: string;
  readonly kind: string;
  readonly start: string;
  /** The last day covered; the same as `start` for a point. */
  readonly end: string;
  readonly depth: number;
}

interface PromptContext {
  /** 'yyyy-MM-dd' — an AI does not know what day it is. */
  readonly today: string;
  /** The project the result will be added to, if one is open. */
  readonly project?: {
    readonly name: string;
    readonly schedules: readonly {
      readonly name: string;
      readonly start: string;
      readonly end: string;
      readonly items: readonly PromptItem[];
    }[];
  };
}

const describeItem = (item: PromptItem): string => {
  const indent = '  '.repeat(item.depth + 1);
  const when = item.kind === 'bar' ? `${item.start} to ${item.end}` : item.start;
  return `${indent}- ${item.name} (${item.kind}, ${when})`;
};

/** What the "Copy instructions" button puts on the clipboard. */
export function buildAuthoringPrompt({ today, project }: PromptContext): string {
  const situation = project
    ? [
        `The result will be added to my FLOID project “${project.name}”, which already has these schedules:`,
        ...project.schedules.flatMap((s) => [
          `- ${s.name} (${s.start} to ${s.end})`,
          ...s.items.map(describeItem),
        ]),
        'Do not repeat them. Line new work up with their dates where it makes sense, and link to their items by exact name where one depends on another.',
      ].join('\n')
    : 'The result will become a new FLOID project.';

  return `I want to build a schedule in FLOID. Today is ${today}.

${situation}

Read the format below. Then ask me what you need to know: what we're making, the teams involved, key dates and gates. If I give you a schedule from other software (a Microsoft Project, Smartsheet, Excel or CSV export, a screenshot, or a list), convert it instead. When you have enough, reply with the FLOID document.

${AUTHORING_SPEC}`;
}
