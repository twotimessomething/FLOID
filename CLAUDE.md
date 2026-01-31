# FLOID - Project Guide

## Project Overview

FLOID is a web-based scheduling tool for industrial designers. It maps the standard product development process onto project timelines with drag-to-resize functionality and multi-team scheduling support.

**Design Philosophy:** Less is more. Simple, clean UX. No unnecessary information.

### Core Concepts

| Term | Definition |
|------|------------|
| Phase | Top-level timeline section within the Industrial Design schedule |
| Element | Sub-item within a phase (has duration) |
| Milestone | Single-point marker on the timeline (no duration) |
| Team | Additional schedule track (e.g., Engineering, Marketing) |
| Relative Position | 0-1 value representing position within parent bounds |
| Playhead | DAW-style scrubber for timeline navigation |

### Tech Stack
- React 18 + TypeScript
- Vite (build tool)
- Zustand (state management)
- TailwindCSS (styling)
- date-fns (date utilities)

---

## Code Guidelines

### TypeScript Standards

**Strict mode is mandatory.** No `any` types except when interfacing with external libraries that require it.

```
// tsconfig.json enforces:
// - strict: true
// - noImplicitAny: true
// - strictNullChecks: true
```

**Use `interface` for object shapes, `type` for unions/intersections:**
```typescript
// Object shapes → interface
interface Phase {
  id: string;
  name: string;
}

// Unions, intersections, primitives → type
type SelectionType = 'phase' | 'element' | 'milestone' | 'team';
type PhaseWithElements = Phase & { elements: Element[] };
```

**Always define return types for functions that aren't immediately obvious:**
```typescript
// Explicit return type
function calculatePosition(date: Date, range: TimeRange): number { ... }

// Implicit OK for simple callbacks
const handleClick = () => setOpen(true);
```

**Use `readonly` for props and immutable data:**
```typescript
interface Props {
  readonly items: readonly Phase[];
  readonly onSelect: (id: string) => void;
}
```

### Component Patterns

**Functional components only.** No class components.

**One component per file.** The filename must match the component name exactly.

**Props interface naming:** `{ComponentName}Props`
```typescript
interface PhaseRowProps {
  phase: Phase;
  isSelected: boolean;
  onSelect: () => void;
}

export function PhaseRow({ phase, isSelected, onSelect }: PhaseRowProps) { ... }
```

**Use named exports, not default exports:**
```typescript
// Correct
export function PhaseRow() { ... }

// Wrong
export default function PhaseRow() { ... }
```

**Extract complex logic into custom hooks.** If a component has more than ~20 lines of logic before the return statement, extract to a hook.

**Colocate small helper components.** If a sub-component is only used by one parent and is under 30 lines, keep it in the same file. Otherwise, extract to its own file.

### State Management (Zustand)

**One store per domain:**
- `projectStore` - Project metadata
- `timelineStore` - Phases, elements, milestones
- `teamStore` - Team schedules
- `uiStore` - UI state (selection, zoom, collapse)

**Store file structure:**
```typescript
interface StoreState {
  // State
  items: Item[];

  // Actions
  addItem: (item: Item) => void;
  removeItem: (id: string) => void;
}

export const useItemStore = create<StoreState>((set, get) => ({
  items: [],

  addItem: (item) => set((state) => ({
    items: [...state.items, item]
  })),

  removeItem: (id) => set((state) => ({
    items: state.items.filter(i => i.id !== id)
  })),
}));
```

**Use selectors to prevent unnecessary re-renders:**
```typescript
// In store
export const selectPhaseById = (id: string) => (state: StoreState) =>
  state.phases.find(p => p.id === id);

// In component
const phase = useTimelineStore(selectPhaseById(phaseId));
```

**Never mutate state directly.** Always use spread operators or array methods that return new arrays.

### File Organization

**Group by feature, not file type** for complex features. Keep related files together:
```
components/
  timeline/
    Timeline.tsx
    TimelineHeader.tsx
    PhaseRow.tsx
    index.ts          # Re-exports all
```

**Every directory with multiple files must have an `index.ts`** that re-exports public items.

**Import order (enforced):**
1. React imports
2. External library imports
3. Internal absolute imports (@components, @stores, etc.)
4. Relative imports
5. Type imports (using `import type`)

### Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `PhaseRow.tsx` |
| Hooks | camelCase, prefix `use` | `useDragResize.ts` |
| Utilities | camelCase | `dateUtils.ts` |
| Constants | SCREAMING_SNAKE_CASE | `MIN_PHASE_DURATION` |
| Types/Interfaces | PascalCase | `interface Phase` |
| Store hooks | camelCase, prefix `use` | `useTimelineStore` |
| Event handlers | camelCase, prefix `handle` | `handleClick` |
| Booleans | camelCase, prefix `is/has/can/should` | `isCollapsed`, `hasChildren` |
| CSS classes | kebab-case (Tailwind) | `bg-gray-100` |

### Styling (TailwindCSS)

**Tailwind classes only.** No inline styles except for computed values (positions, dimensions).

**Computed styles use style prop:**
```typescript
<div
  className="absolute top-0 bg-blue-500"
  style={{ left: `${position}px`, width: `${width}px` }}
/>
```

**Extract repeated class combinations to constants:**
```typescript
const BUTTON_BASE = 'px-4 py-2 rounded font-medium transition-colors';
const BUTTON_PRIMARY = `${BUTTON_BASE} bg-blue-600 text-white hover:bg-blue-700`;
```

**Use Tailwind's design tokens.** Don't use arbitrary values unless absolutely necessary:
```typescript
// Prefer
className="p-4 text-gray-600"

// Avoid
className="p-[17px] text-[#666]"
```

### Performance

**Memoize expensive computations:**
```typescript
const sortedPhases = useMemo(
  () => phases.sort((a, b) => a.order - b.order),
  [phases]
);
```

**Use `useCallback` for handlers passed to child components:**
```typescript
const handleSelect = useCallback((id: string) => {
  selectPhase(id);
}, [selectPhase]);
```

**Avoid creating objects/arrays in render:**
```typescript
// Wrong - creates new array every render
<Component items={items.filter(i => i.active)} />

// Correct - memoize the filtered result
const activeItems = useMemo(() => items.filter(i => i.active), [items]);
<Component items={activeItems} />
```

**Split store selectors to minimize re-renders.** Select only the specific state needed:
```typescript
// Wrong - re-renders on any store change
const { phases, zoom, selection } = useTimelineStore();

// Correct - only re-renders when phases change
const phases = useTimelineStore(state => state.phases);
```

### Error Handling

**Use early returns for guard clauses:**
```typescript
function getPhase(id: string): Phase | null {
  if (!id) return null;

  const phase = phases.find(p => p.id === id);
  if (!phase) return null;

  return phase;
}
```

**Handle loading and error states explicitly:**
```typescript
if (loading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
return <Content data={data} />;
```

**Log errors in development, fail gracefully in production:**
```typescript
try {
  const data = parseData(input);
} catch (error) {
  if (import.meta.env.DEV) {
    console.error('Parse failed:', error);
  }
  return fallbackValue;
}
```

---

## Key Architecture Decisions

Document significant patterns and decisions here as they are established.

### Relative Positioning System
All timeline items store position as relative values (0-1) within their parent. This enables automatic cascading when parents are resized. Absolute dates are computed at render time.

### Selection Model
Single selection only. Selecting any item (phase, element, milestone, team) opens the sidebar editor. Selection state lives in `uiStore`.

### Collapse State
Collapse state is UI-only (not persisted with project data). Lives in `uiStore` as a Set of collapsed IDs.

---

## Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build to dist/
npm run preview  # Preview production build
npm run lint     # Run ESLint
npm run format   # Run Prettier
npm run typecheck # Run TypeScript compiler check
```

---

## File Structure

```
src/
├── main.tsx                 # App entry point
├── App.tsx                  # Root component, layout
├── index.css                # Tailwind imports, global styles
│
├── components/
│   ├── layout/              # App shell components
│   │   ├── Header.tsx
│   │   ├── EditorSidebar.tsx
│   │   ├── TimelineContainer.tsx
│   │   └── index.ts
│   │
│   ├── timeline/            # Timeline-specific components
│   │   ├── Timeline.tsx
│   │   ├── TimelineHeader.tsx
│   │   ├── TimelineGrid.tsx
│   │   ├── PhaseRow.tsx
│   │   ├── ElementRow.tsx
│   │   ├── MilestoneMarker.tsx
│   │   ├── TeamSection.tsx
│   │   ├── DragHandle.tsx
│   │   ├── Playhead.tsx
│   │   ├── CurrentDayLine.tsx
│   │   └── index.ts
│   │
│   ├── panels/              # Sidebar editor panels
│   │   ├── PhaseEditor.tsx
│   │   ├── ElementEditor.tsx
│   │   ├── MilestoneEditor.tsx
│   │   ├── TeamEditor.tsx
│   │   └── index.ts
│   │
│   ├── controls/            # Interactive controls
│   │   ├── ZoomControls.tsx
│   │   ├── AddTeamButton.tsx
│   │   ├── AddItemButton.tsx
│   │   └── index.ts
│   │
│   └── common/              # Shared UI components
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── DateInput.tsx
│       └── index.ts
│
├── stores/                  # Zustand stores
│   ├── projectStore.ts
│   ├── timelineStore.ts
│   ├── teamStore.ts
│   ├── uiStore.ts
│   └── index.ts
│
├── hooks/                   # Custom React hooks
│   ├── useDragResize.ts
│   ├── useDragReorder.ts
│   ├── usePlayhead.ts
│   ├── useAutoSave.ts
│   └── index.ts
│
├── types/                   # TypeScript type definitions
│   ├── project.ts
│   ├── timeline.ts
│   ├── team.ts
│   └── index.ts
│
├── utils/                   # Pure utility functions
│   ├── dateUtils.ts
│   ├── timelineUtils.ts
│   ├── storageUtils.ts
│   ├── exportUtils.ts
│   └── index.ts
│
├── constants/               # App constants
│   ├── designProcess.ts
│   ├── colors.ts
│   ├── layout.ts
│   └── index.ts
│
└── data/                    # Static data, templates
    └── defaultTemplate.ts
```

---

## Quick Reference

### Path Aliases
```typescript
import { PhaseRow } from '@components/timeline';
import { useTimelineStore } from '@stores';
import { formatDate } from '@utils';
import type { Phase } from '@types';
```

### Common Patterns

**Selecting store state:**
```typescript
const phases = useTimelineStore(state => state.phases);
const { addPhase, removePhase } = useTimelineStore();
```

**Conditional classes:**
```typescript
className={`base-class ${isActive ? 'active-class' : ''}`}
```

**Event handler with data:**
```typescript
onClick={() => handleSelect(item.id)}
```
