import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useTimelineStatus, type StatusItem, type MilestoneItem } from '../../hooks/useTimelineStatus';
import { format } from 'date-fns';

interface GroupedItems {
  sectionId: string;
  sectionName: string;
  sectionOrder: number;
  phases: {
    phaseId: string;
    phaseName: string;
    phaseOrder: number;
    color: string;
    items: StatusItem[];
  }[];
}

function groupItemsBySection(items: StatusItem[]): GroupedItems[] {
  const sectionMap = new Map<string, GroupedItems>();

  items.forEach((item) => {
    let section = sectionMap.get(item.sectionId);
    if (!section) {
      section = {
        sectionId: item.sectionId,
        sectionName: item.sectionName,
        sectionOrder: item.sectionOrder,
        phases: [],
      };
      sectionMap.set(item.sectionId, section);
    }

    const phaseId = item.phaseId ?? item.id;
    const phaseName = item.phaseName ?? item.name;
    let phase = section.phases.find((p) => p.phaseId === phaseId);
    if (!phase) {
      phase = {
        phaseId,
        phaseName,
        phaseOrder: item.phaseOrder ?? 0,
        color: item.color,
        items: [],
      };
      section.phases.push(phase);
    }

    phase.items.push(item);
  });

  // Sort sections by order, phases by order within sections
  const result = Array.from(sectionMap.values());
  result.sort((a, b) => a.sectionOrder - b.sectionOrder);
  result.forEach((section) => {
    section.phases.sort((a, b) => a.phaseOrder - b.phaseOrder);
  });

  return result;
}

interface StatusItemRowProps {
  readonly item: StatusItem;
  readonly showDate?: boolean;
  readonly isPhaseLevel?: boolean;
}

function StatusItemRow({ item, showDate, isPhaseLevel }: StatusItemRowProps) {
  // If it's a task within a phase, show task name
  // If it's a phase-level item (no tasks), we just show the phase name in the header
  if (isPhaseLevel) {
    return null;
  }

  return (
    <div className="flex items-start gap-2 py-0.5 pl-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-[var(--color-text-primary)]">{item.name}</div>
        {showDate && item.date && (
          <div className="text-xs text-[var(--color-text-muted)]">{format(item.date, 'MMM d')}</div>
        )}
      </div>
    </div>
  );
}

interface PhaseGroupProps {
  readonly phaseName: string;
  readonly color: string;
  readonly items: StatusItem[];
  readonly showDate?: boolean;
}

function PhaseGroup({ phaseName, color, items, showDate }: PhaseGroupProps) {
  // Check if this is a phase-level item (the phase itself, not tasks)
  const isPhaseLevel = items.length === 1 && items[0].phaseName === items[0].name;

  return (
    <div className="py-1">
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm text-[var(--color-text-primary)]">{phaseName}</span>
        {isPhaseLevel && showDate && items[0].date && (
          <span className="text-xs text-[var(--color-text-muted)]">{format(items[0].date, 'MMM d')}</span>
        )}
      </div>
      {!isPhaseLevel && (
        <div className="mt-0.5">
          {items.map((item) => (
            <StatusItemRow key={item.id} item={item} showDate={showDate} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SectionGroupProps {
  readonly sectionName: string;
  readonly phases: GroupedItems['phases'];
  readonly showDate?: boolean;
}

function SectionGroup({ sectionName, phases, showDate }: SectionGroupProps) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">{sectionName}</div>
      <div className="space-y-0.5">
        {phases.map((phase) => (
          <PhaseGroup
            key={phase.phaseId}
            phaseName={phase.phaseName}
            color={phase.color}
            items={phase.items}
            showDate={showDate}
          />
        ))}
      </div>
    </div>
  );
}

interface MilestoneRowProps {
  readonly item: MilestoneItem;
}

function MilestoneRow({ item }: MilestoneRowProps) {
  return (
    <div className="flex items-start gap-2 py-1">
      <div
        className="w-2 h-2 rotate-45 mt-1 flex-shrink-0"
        style={{ backgroundColor: item.color }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-[var(--color-text-primary)]">{item.name}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-secondary)]">{item.sectionName}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{format(item.date, 'MMM d')}</span>
        </div>
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  readonly title: string;
}

function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <div className="mb-3 pb-1.5 border-b border-[var(--color-border)]">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
    </div>
  );
}

export function InfoSidebar() {
  const { isInfoSidebarOpen, toggleInfoSidebar, infoSidebarWidth, setInfoSidebarWidth, openSettingsModal, openKeyboardHelpModal } = useUIStore();
  const { inFlight, nextUp, upcomingMilestones } = useTimelineStatus();

  const groupedInFlight = useMemo(() => groupItemsBySection(inFlight), [inFlight]);
  const groupedNextUp = useMemo(() => groupItemsBySection(nextUp), [nextUp]);

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

    const handleMouseMove = (e: MouseEvent) => {
      // Dragging left increases width, dragging right decreases
      const deltaX = resizeStartX.current - e.clientX;
      setInfoSidebarWidth(resizeStartWidth.current + deltaX);
    };

    const handleMouseUp = () => {
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
      <button
        onClick={toggleInfoSidebar}
        className="flex-shrink-0 w-10 h-full border-l border-[var(--color-border)] bg-[var(--color-background)] flex items-start justify-center pt-4 hover:bg-[var(--color-hover)] transition-colors duration-150"
        aria-label="Open status sidebar"
      >
        <svg
          className="w-4 h-4 text-[var(--color-text-secondary)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    );
  }

  const hasContent = inFlight.length > 0 || nextUp.length > 0 || upcomingMilestones.length > 0;

  return (
    <aside
      className="flex-shrink-0 border-l border-[var(--color-border)] bg-[var(--color-background)] flex flex-col relative"
      style={{ width: infoSidebarWidth }}
    >
      {/* Resize handle */}
      <div
        className={`absolute top-0 -left-0.5 w-1 h-full cursor-col-resize z-10 transition-colors ${
          isResizing ? 'bg-[var(--color-focus)]' : 'hover:bg-[var(--color-focus)]/70'
        }`}
        onMouseDown={handleResizeMouseDown}
        aria-label="Resize status sidebar"
        role="separator"
      />
      {/* Header with collapse button */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-medium text-[var(--color-text-primary)]">Status</h2>
        <button
          onClick={toggleInfoSidebar}
          className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-active)] rounded-md transition-colors duration-150"
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
          <div className="text-sm text-[var(--color-text-muted)] text-center py-4">
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
                {groupedInFlight.map((section) => (
                  <SectionGroup
                    key={section.sectionId}
                    sectionName={section.sectionName}
                    phases={section.phases}
                  />
                ))}
              </div>
            )}

            {/* Next Up section */}
            {groupedNextUp.length > 0 && (
              <div>
                <SectionHeader title="Next Up" />
                {groupedNextUp.map((section) => (
                  <SectionGroup
                    key={section.sectionId}
                    sectionName={section.sectionName}
                    phases={section.phases}
                    showDate
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tooltips section */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-[var(--color-border)]">
        <div className="text-xs text-[var(--color-text-muted)] space-y-1">
          <div className="flex items-center gap-2">
            <kbd className="px-1 py-0.5 bg-[var(--color-active)] rounded text-[10px]">Shift</kbd>
            <span>+ drag to preserve children</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1 py-0.5 bg-[var(--color-active)] rounded text-[10px]">Shift</kbd>
            <span>+</span>
            <kbd className="px-1 py-0.5 bg-[var(--color-active)] rounded text-[10px]">⌘</kbd>
            <span>+ drag end to ripple</span>
          </div>
        </div>
      </div>

      {/* Settings and help buttons */}
      <div className="flex-shrink-0 p-3 border-t border-[var(--color-border)] flex justify-end gap-1">
        <button
          onClick={openKeyboardHelpModal}
          className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-active)] rounded-md transition-colors duration-150"
          aria-label="Keyboard shortcuts"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
            />
          </svg>
        </button>
        <button
          onClick={openSettingsModal}
          className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-active)] rounded-md transition-colors duration-150"
          aria-label="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        </button>
      </div>
    </aside>
  );
}
