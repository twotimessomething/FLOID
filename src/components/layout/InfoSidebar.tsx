import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import {
  useTimelineStatus,
  type Ancestry,
  type MilestoneItem,
  type StatusItem,
} from '../../hooks/useTimelineStatus';
import { formatDayKey } from '../../utils/dateUtils';

/** Joins trail keys. No name can contain it, so no two trails can collide. */
const TRAIL_KEY_SEPARATOR = '\u0000';

/**
 * The rail the panel folds down to. The open width is the user's own, so the
 * contents are pinned to it while the box narrows — clipped, never re-wrapped.
 */
const RAIL_WIDTH = 32;

interface AncestryGroup {
  readonly key: string;
  readonly ancestors: Ancestry;
  readonly items: StatusItem[];
}

interface SectionBucket {
  readonly sectionId: string;
  readonly sectionName: string;
  readonly groups: AncestryGroup[];
}

/** The ancestor trail as the editor writes it, so the two panels read alike. */
function formatTrail(ancestors: Ancestry): string {
  return ancestors.map((name) => name || 'Untitled').join(' / ');
}

/**
 * Schedule first, then the trail of bars an item sits under.
 *
 * Items share a heading only when their whole trail matches, so an item three
 * levels down gets its own heading instead of being folded in beside its
 * grandparent's other descendants. Both maps preserve insertion order, which
 * is already the order the timeline reads in.
 */
function groupBySection(items: readonly StatusItem[]): SectionBucket[] {
  const buckets = new Map<string, SectionBucket>();

  for (const item of items) {
    let bucket = buckets.get(item.sectionId);
    if (!bucket) {
      bucket = { sectionId: item.sectionId, sectionName: item.sectionName, groups: [] };
      buckets.set(item.sectionId, bucket);
    }

    const key = item.ancestors.join(TRAIL_KEY_SEPARATOR);
    let group = bucket.groups.find((candidate) => candidate.key === key);
    if (!group) {
      group = { key, ancestors: item.ancestors, items: [] };
      bucket.groups.push(group);
    }
    group.items.push(item);
  }

  return [...buckets.values()];
}

function NavigateChevron(): JSX.Element {
  return (
    <svg
      className="row-affordance w-3 h-3 flex-shrink-0 text-[var(--color-text-muted)]"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

interface StatusRowProps {
  readonly item: StatusItem;
  readonly showDate?: boolean;
}

function StatusRow({ item, showDate }: StatusRowProps): JSX.Element {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      useUIStore.getState().selectItem(item.id, item.sectionId, { x: e.clientX, y: e.clientY });
    },
    [item.id, item.sectionId]
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group row-selectable focus-ring flex w-full items-center gap-2 py-0.5 -mx-1 px-1 text-left"
    >
      <span
        className="w-[5px] h-[5px] rounded-full flex-shrink-0"
        style={{ backgroundColor: item.color }}
      />
      <span className="min-w-0 flex-1 truncate text-body text-[var(--color-text-primary)]">
        {item.name || 'Untitled'}
      </span>
      {showDate && (
        <span className="text-meta text-[var(--color-text-muted)] flex-shrink-0">
          {formatDayKey(item.start, 'MMM d')}
        </span>
      )}
      <NavigateChevron />
    </button>
  );
}

interface SectionGroupProps {
  readonly bucket: SectionBucket;
  readonly showDate?: boolean;
}

function SectionGroup({ bucket, showDate }: SectionGroupProps): JSX.Element {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 truncate">
        {bucket.sectionName || 'Untitled Schedule'}
      </div>
      <div className="space-y-0.5">
        {bucket.groups.map((group) => (
          <div key={group.key} className="py-0.5">
            {group.ancestors.length > 0 && (
              <div className="text-meta text-[var(--color-text-muted)] truncate">
                {formatTrail(group.ancestors)}
              </div>
            )}
            <div className={group.ancestors.length > 0 ? 'pl-3' : undefined}>
              {group.items.map((item) => (
                <StatusRow key={item.id} item={item} showDate={showDate} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MilestoneRowProps {
  readonly item: MilestoneItem;
}

function MilestoneRow({ item }: MilestoneRowProps): JSX.Element {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      useUIStore.getState().selectItem(item.id, item.sectionId, { x: e.clientX, y: e.clientY });
    },
    [item.id, item.sectionId]
  );

  // A milestone is listed across every schedule at once, so it carries its own
  // location: the schedule, then whichever bars it is nested inside.
  const trail = formatTrail([item.sectionName || 'Untitled Schedule', ...item.ancestors]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group row-selectable focus-ring flex w-full items-start gap-2 py-1 -mx-1 px-1 text-left"
    >
      <span
        className="w-[5px] h-[5px] rotate-45 mt-1 flex-shrink-0"
        style={{ backgroundColor: item.color }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-[var(--color-text-primary)]">
          {item.name || 'Milestone'}
        </span>
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-meta text-[var(--color-text-secondary)]">
            {trail}
          </span>
          <span className="text-meta text-[var(--color-text-muted)] flex-shrink-0">
            {formatDayKey(item.date, 'MMM d')}
          </span>
        </span>
      </span>
      <NavigateChevron />
    </button>
  );
}

interface SectionHeaderProps {
  readonly title: string;
}

function SectionHeader({ title }: SectionHeaderProps): JSX.Element {
  return (
    <div className="mb-3">
      <h3 className="eyebrow">{title}</h3>
    </div>
  );
}

function HelpIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
      />
    </svg>
  );
}

function SettingsIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

interface QuietIconButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

/**
 * Settings and help, drawn the same whether the panel is open or folded to its
 * rail — the pair is the app's only way in to either, so it cannot look like
 * two different controls depending on the width.
 */
function QuietIconButton({ label, onClick, children }: QuietIconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-[var(--radius-sm)] transition-colors duration-fast focus-ring"
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function InfoSidebar(): JSX.Element {
  const isInfoSidebarOpen = useUIStore((state) => state.isInfoSidebarOpen);
  const toggleInfoSidebar = useUIStore((state) => state.toggleInfoSidebar);
  const infoSidebarWidth = useUIStore((state) => state.infoSidebarWidth);
  const setInfoSidebarWidth = useUIStore((state) => state.setInfoSidebarWidth);
  const openSettingsModal = useUIStore((state) => state.openSettingsModal);
  const openKeyboardHelpModal = useUIStore((state) => state.openKeyboardHelpModal);

  const { inFlight, nextUp, upcomingMilestones } = useTimelineStatus();

  const groupedInFlight = useMemo(() => groupBySection(inFlight), [inFlight]);
  const groupedNextUp = useMemo(() => groupBySection(nextUp), [nextUp]);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = infoSidebarWidth;
  }, [infoSidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent): void => {
      // Dragging left increases width, dragging right decreases
      const deltaX = resizeStartX.current - e.clientX;
      setInfoSidebarWidth(resizeStartWidth.current + deltaX);
    };

    const handleMouseUp = (): void => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setInfoSidebarWidth]);

  if (!isInfoSidebarOpen) {
    return (
      <aside
        className="flex-shrink-0 h-full overflow-hidden bg-[var(--color-background)] border-l border-[var(--color-hairline)] sidebar-fold"
        style={{ width: RAIL_WIDTH }}
      >
        {/* The rail keeps the panel's own width so the fold clips it rather
            than reflowing it, exactly as the open panel is handled below. The
            chevron's own padding leaves its icon 16px down, where the open
            panel's header keeps it, so folding does not shift it. */}
        <div
          className="sidebar-enter h-full flex flex-col items-center pt-2.5 pb-3"
          style={{ width: RAIL_WIDTH }}
        >
          <button
            type="button"
            onClick={toggleInfoSidebar}
            className="group p-1.5 rounded-[var(--radius-sm)] focus-ring"
            aria-label="Open status sidebar"
          >
            <svg
              className="w-4 h-4 text-[var(--color-text-muted)] opacity-40 group-hover:opacity-100 transition-opacity duration-fast"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Folding the panel away must not fold away the only route to
              settings, support and the shortcut list. Same pair, same order as
              the open panel's footer, stood on end. */}
          <div className="mt-auto flex flex-col items-center gap-1">
            <QuietIconButton label="Shortcuts and gestures" onClick={openKeyboardHelpModal}>
              <HelpIcon />
            </QuietIconButton>
            <QuietIconButton label="Settings" onClick={openSettingsModal}>
              <SettingsIcon />
            </QuietIconButton>
          </div>
        </div>
      </aside>
    );
  }

  const hasContent = inFlight.length > 0 || nextUp.length > 0 || upcomingMilestones.length > 0;

  return (
    <aside
      className="relative flex-shrink-0 h-full overflow-hidden bg-[var(--color-background)] border-l border-[var(--color-hairline)] sidebar-fold"
      style={{
        width: infoSidebarWidth,
        // A resize drag writes the width on every mousemove; easing those would
        // make the edge lag the cursor. The fold only applies to the toggle.
        transitionDuration: isResizing ? '0ms' : undefined,
      }}
    >
      {/* Resize handle. Inside the panel's edge — the fold clips whatever
          overflows it, and a handle hanging outside would lose half its width. */}
      <div
        className={`absolute top-0 left-0 w-1 h-full cursor-col-resize z-10 transition-colors duration-fast ${
          isResizing ? 'bg-[var(--color-focus)]' : 'hover:bg-[var(--color-focus)]/70'
        }`}
        onMouseDown={handleResizeMouseDown}
        aria-label="Resize status sidebar"
        role="separator"
      />
      <div
        className="sidebar-enter h-full flex flex-col"
        style={{ width: infoSidebarWidth }}
      >
        {/* Header with collapse button */}
        <div className="flex items-center justify-between p-3">
          <h2 className="eyebrow">Status</h2>
          <button
            onClick={toggleInfoSidebar}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-fast focus-ring"
            aria-label="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-3">
          {!hasContent ? (
            <div className="text-body text-[var(--color-text-muted)] text-center py-4">
              No active items
            </div>
          ) : (
            <div className="space-y-5">
              {/* Upcoming Milestones section - now at top */}
              {upcomingMilestones.length > 0 && (
                <div>
                  <SectionHeader title="Milestones" />
                  <div className="space-y-0.5">
                    {upcomingMilestones.map((item) => (
                      <MilestoneRow key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* In Flight section */}
              {groupedInFlight.length > 0 && (
                <div>
                  <SectionHeader title="In Flight" />
                  {groupedInFlight.map((bucket) => (
                    <SectionGroup key={bucket.sectionId} bucket={bucket} />
                  ))}
                </div>
              )}

              {/* Next Up section */}
              {groupedNextUp.length > 0 && (
                <div>
                  <SectionHeader title="Next Up" />
                  {groupedNextUp.map((bucket) => (
                    <SectionGroup key={bucket.sectionId} bucket={bucket} showDate />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Settings and help buttons */}
        <div className="flex-shrink-0 p-3 flex justify-end gap-1">
          <QuietIconButton label="Shortcuts and gestures" onClick={openKeyboardHelpModal}>
            <HelpIcon />
          </QuietIconButton>
          <QuietIconButton label="Settings" onClick={openSettingsModal}>
            <SettingsIcon />
          </QuietIconButton>
        </div>
      </div>
    </aside>
  );
}
