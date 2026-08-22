import { memo, useCallback } from 'react';
import type { Section } from '../../types';
import { useSectionStore } from '../../stores/sectionStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { LABEL_ROOT_INSET, ROW_HEIGHT } from '../../utils/timelineUtils';
import { useInlineEdit } from '../../hooks/useInlineEdit';
import { useDoubleClick } from '../../hooks/useDoubleClick';
import { PinBadge } from '../common';

interface DragHandleProps {
  readonly onPointerDown: (e: React.PointerEvent) => void;
  readonly style: React.CSSProperties;
}

interface ScheduleLabelRowProps {
  readonly section: Section;
  readonly dragHandleProps?: DragHandleProps;
}

/**
 * A schedule's name row in the labels column.
 *
 * It is its own component because it is drawn twice: once in place, and once
 * in the sticky band that holds the schedule under the axis while its rows
 * scroll past. Both are the same row — selecting, renaming and collapsing work
 * from either — so neither can be a copy of the other's markup.
 */
export const ScheduleLabelRow = memo(function ScheduleLabelRow({
  section,
  dragHandleProps,
}: ScheduleLabelRowProps): JSX.Element {
  const toggleSectionCollapse = useSectionStore((s) => s.toggleSectionCollapse);
  const updateSection = useSectionStore((s) => s.updateSection);
  const pinnedSectionId = useProjectStore((s) => s.project?.pinnedSectionId ?? null);
  const selectSection = useUIStore((s) => s.selectSection);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const isSelected = useUIStore(
    (s) => s.selection.type === 'section' && s.selection.id === section.id
  );

  const inlineEdit = useInlineEdit();
  const isEditingName = inlineEdit.editingId === section.id;
  const isPinned = section.id === pinnedSectionId;

  const handleSelectSection = useCallback(
    (e: React.MouseEvent): void => {
      selectSection(section.id, { x: e.clientX, y: e.clientY });
    },
    [selectSection, section.id]
  );

  /** The highlight lands on the press; only the editor waits out the rename. */
  const handlePressSelectSection = useCallback(
    (e: React.PointerEvent): void => {
      // Secondary and middle buttons belong to the context menu and to panning
      if (e.button !== 0) return;
      selectSection(section.id, { x: e.clientX, y: e.clientY }, { openEditor: false });
    },
    [selectSection, section.id]
  );

  const handleRenameSection = useCallback((): void => {
    inlineEdit.startEditing(section.id, section.name || '');
  }, [inlineEdit, section.id, section.name]);

  const handleSaveName = useCallback(
    (name: string): void => {
      updateSection(section.id, { name });
    },
    [updateSection, section.id]
  );

  const labelClick = useDoubleClick(handleSelectSection, handleRenameSection);

  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent): void => {
      e.stopPropagation();
      toggleSectionCollapse(section.id);
    },
    [toggleSectionCollapse, section.id]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const bounds = (e.target as HTMLElement).getBoundingClientRect();
        selectSection(section.id, { x: bounds.right, y: bounds.top });
      }
    },
    [selectSection, section.id]
  );

  const handleLabelContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      openContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetType: 'section',
        targetId: section.id,
        sectionId: section.id,
        location: 'label',
      });
    },
    [openContextMenu, section.id]
  );

  return (
    <div
      className={`group flex items-center gap-1.5 pr-3 cursor-pointer row-selectable focus-ring ${
        isSelected ? 'selected' : ''
      }`}
      style={{ height: ROW_HEIGHT, paddingLeft: LABEL_ROOT_INSET }}
      onPointerDown={isEditingName ? undefined : handlePressSelectSection}
      onClick={isEditingName ? undefined : labelClick.handleClick}
      onDoubleClick={isEditingName ? undefined : labelClick.handleDoubleClick}
      onContextMenu={handleLabelContextMenu}
      onKeyDown={isEditingName ? undefined : handleKeyDown}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={`${section.name} schedule${isSelected ? ', selected' : ''}`}
    >
      <button
        onClick={handleToggleCollapse}
        className="row-affordance w-5 h-5 flex-shrink-0 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] focus-ring rounded transition-colors duration-fast"
        data-always-visible={section.isCollapsed ? 'true' : undefined}
        aria-expanded={!section.isCollapsed}
        aria-label={`${section.isCollapsed ? 'Expand' : 'Collapse'} ${section.name}`}
      >
        <svg
          className={`w-3 h-3 collapse-chevron ${section.isCollapsed ? '' : 'expanded'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isEditingName ? (
        <input
          ref={inlineEdit.inputRef}
          className="text-body font-semibold text-[var(--color-text-primary)] bg-transparent border-b border-[var(--color-focus)] outline-none truncate min-w-0 flex-1"
          value={inlineEdit.editedName}
          onChange={inlineEdit.handleChange}
          onKeyDown={(e) => inlineEdit.handleKeyDown(e, handleSaveName)}
          onBlur={() => inlineEdit.saveEdit(handleSaveName)}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="text-body font-semibold text-[var(--color-text-primary)] truncate">
          {section.name || 'Untitled Schedule'}
        </span>
      )}
      <span className="flex-1" />
      {section.isLocked && (
        <svg
          className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-label="Locked"
        >
          <path
            fillRule="evenodd"
            d="M4 6V4a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 7.5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-6A1.5 1.5 0 0 1 3.5 6H4zm2-2a2 2 0 1 1 4 0v2H6V4z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {isPinned && <PinBadge size="sm" />}
      {dragHandleProps && (
        <div
          {...dragHandleProps}
          className="row-affordance flex-shrink-0 flex items-center justify-center w-4 h-4 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] rounded transition-colors duration-fast touch-none"
          title="Drag to reorder"
          aria-label={`Drag to reorder ${section.name}`}
        >
          <svg className="w-3 h-3" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
            <circle cx="2" cy="2" r="1.5" />
            <circle cx="8" cy="2" r="1.5" />
            <circle cx="2" cy="8" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="2" cy="14" r="1.5" />
            <circle cx="8" cy="14" r="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
});
