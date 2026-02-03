import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import type { BarMilestone } from '../../types';
import { useSectionStore, selectSection, selectPhase, selectElement } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import type { ContextMenuLocation } from '../../stores/uiStore';
import { getDateFromRelativePosition, formatDate } from '../../utils/dateUtils';

interface BarMilestoneMarkerProps {
  readonly barMilestone: BarMilestone;
  readonly sectionId: string;
  readonly phaseId: string;
  readonly elementId?: string;
  readonly barWidth: number;
  readonly color: string;
}

export function BarMilestoneMarker({
  barMilestone,
  sectionId,
  phaseId,
  elementId,
  barWidth,
  color,
}: BarMilestoneMarkerProps): JSX.Element {
  const { updatePhaseBarMilestone, updateElementBarMilestone } = useSectionStore();
  const { selection, selectItem, setDragging, openContextMenu } = useUIStore();

  // Get section, phase, and element data for date calculations
  const sectionSelector = useMemo(() => selectSection(sectionId), [sectionId]);
  const phaseSelector = useMemo(() => selectPhase(sectionId, phaseId), [sectionId, phaseId]);
  const elementSelector = useMemo(() => selectElement(sectionId, phaseId, elementId || ''), [sectionId, phaseId, elementId]);
  const section = useSectionStore(sectionSelector);
  const phase = useSectionStore(phaseSelector);
  const element = useSectionStore(elementSelector);

  const isSelected =
    selection.type === 'barMilestone' &&
    selection.id === barMilestone.id &&
    selection.phaseId === phaseId &&
    selection.elementId === elementId;

  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const hasDragged = useRef(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragDate, setDragDate] = useState<string | null>(null);

  // Ref to avoid effect re-runs during drag
  const positionRef = useRef(barMilestone.relativePosition);
  positionRef.current = barMilestone.relativePosition;

  const markerLeft = barMilestone.relativePosition * barWidth;

  // Calculate date from bar milestone position
  const calculateDate = useCallback((relativePos: number): string | null => {
    if (!section || !phase) return null;

    const phaseWidth = phase.relativeEnd - phase.relativeStart;

    if (elementId && element) {
      // Bar milestone on element: convert element-relative to section-relative
      const elementSectionStart = phase.relativeStart + element.relativeStart * phaseWidth;
      const elementSectionEnd = phase.relativeStart + element.relativeEnd * phaseWidth;
      const elementWidth = elementSectionEnd - elementSectionStart;
      const sectionRelative = elementSectionStart + relativePos * elementWidth;
      const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionRelative);
      return formatDate(date, 'MMM d');
    } else {
      // Bar milestone on phase: convert phase-relative to section-relative
      const sectionRelative = phase.relativeStart + relativePos * phaseWidth;
      const date = getDateFromRelativePosition(section.startDate, section.endDate, sectionRelative);
      return formatDate(date, 'MMM d');
    }
  }, [section, phase, element, elementId]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasDragged.current) {
        hasDragged.current = false;
        return;
      }
      selectItem('barMilestone', barMilestone.id, sectionId, phaseId, { x: e.clientX, y: e.clientY }, elementId);
    },
    [selectItem, barMilestone.id, sectionId, phaseId, elementId]
  );

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingRef.current = true;
      lastXRef.current = e.clientX;
      setDragging(true, 'move');
      setIsDragActive(true);
      setDragDate(calculateDate(positionRef.current));
      document.body.classList.add('no-select');
    },
    [setDragging, calculateDate]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - lastXRef.current;
      lastXRef.current = e.clientX;

      if (Math.abs(deltaX) > 0) {
        hasDragged.current = true;
      }

      // Convert pixel delta to relative position within bar
      const deltaRelative = barWidth > 0 ? deltaX / barWidth : 0;
      const newPosition = Math.max(0, Math.min(1, positionRef.current + deltaRelative));

      if (elementId) {
        updateElementBarMilestone(sectionId, phaseId, elementId, barMilestone.id, { relativePosition: newPosition });
      } else {
        updatePhaseBarMilestone(sectionId, phaseId, barMilestone.id, { relativePosition: newPosition });
      }

      // Update drag date
      setDragDate(calculateDate(newPosition));
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setDragging(false);
      setIsDragActive(false);
      setDragDate(null);
      document.body.classList.remove('no-select');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sectionId, phaseId, elementId, barMilestone.id, barWidth, updatePhaseBarMilestone, updateElementBarMilestone, setDragging, calculateDate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        selectItem('barMilestone', barMilestone.id, sectionId, phaseId, { x: rect.right, y: rect.top }, elementId);
      }
    },
    [selectItem, barMilestone.id, sectionId, phaseId, elementId]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const location: ContextMenuLocation = 'bar';
      openContextMenu(
        { x: e.clientX, y: e.clientY },
        'barMilestone',
        barMilestone.id,
        sectionId,
        phaseId,
        elementId,
        location
      );
    },
    [openContextMenu, barMilestone.id, sectionId, phaseId, elementId]
  );

  // Calculate contrasting text color (simple luminance check)
  const getContrastColor = (hexColor: string): string => {
    const hex = hexColor.replace('#', '').slice(0, 6);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.95)';
  };

  const textColor = getContrastColor(color);

  return (
    <div
      className={`absolute top-0 bottom-0 w-4 -ml-2 flex items-center justify-center cursor-grab active:cursor-grabbing z-10 ${
        isSelected ? 'z-20' : ''
      }`}
      style={{ left: markerLeft }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      role="button"
      tabIndex={0}
      aria-label={`${barMilestone.name} bar milestone at ${Math.round(barMilestone.relativePosition * 100)}%`}
      aria-selected={isSelected}
    >
      {/* Tick mark - visual line centered in wider touch target */}
      <div
        className={`absolute top-0 bottom-0 w-px left-1/2 -translate-x-1/2 ${isDragActive ? 'opacity-80' : 'opacity-60'}`}
        style={{ backgroundColor: textColor }}
        aria-hidden="true"
      />

      {/* Date bubble - shown while dragging */}
      {isDragActive && dragDate && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 px-2 py-1 bg-[var(--color-tooltip)] text-[var(--color-tooltip-text)] text-xs font-medium rounded shadow-lg whitespace-nowrap z-50 pointer-events-none"
          aria-hidden="true"
        >
          {dragDate}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--color-tooltip)]" />
        </div>
      )}

      {/* Label - positioned above the bar, also draggable */}
      <div
        className={`absolute bottom-full left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] font-medium rounded whitespace-nowrap cursor-grab active:cursor-grabbing transition-all duration-150 bg-[var(--color-surface)] text-[var(--color-text-primary)] border border-[var(--color-border)] ${
          isSelected
            ? 'ring-2 ring-[var(--color-focus)] ring-offset-1'
            : ''
        }`}
        style={{
          marginBottom: 1,
        }}
      >
        {barMilestone.name || 'Milestone'}
      </div>
    </div>
  );
}
