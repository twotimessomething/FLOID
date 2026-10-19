import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useSectionStore,
  selectItem,
  selectSection,
  typeInto,
  endTypingStep,
} from '../../stores/sectionStore';
import { useUIStore, showItemDeletedToast } from '../../stores/uiStore';
import { Input, TextArea, DateInput, ColorPicker, Button, Toggle } from '../common';
import { useNameDraft } from '../../hooks/useNameDraft';
import { countItems, findItemPath } from '../../utils/itemTree';
import { resolveItemColor } from '../../utils/timelineUtils';
import { endAfterLastDay, fromDayKey, lastDayOf, toDayKey } from '../../utils/dayKeys';
import { commitWithSlide } from '../../commands/slideCommit';
import type { Section, SelectionState, TimelineItem } from '../../types';

/**
 * The editor for anything on the timeline.
 *
 * A bar three levels deep and a milestone on a schedule's own row are the same
 * record, so they get the same panel — the only thing that varies is whether
 * there is a second date to set. Where the item sits is shown as a breadcrumb
 * rather than baked into which editor opened.
 */
interface ItemEditorProps {
  /**
   * What to edit. Given explicitly by the modal so the panel keeps its contents
   * through the closing animation, after the live selection has been dropped.
   */
  readonly selection?: SelectionState;
}

export function ItemEditor({ selection: given }: ItemEditorProps = {}): JSX.Element {
  const live = useUIStore((s) => s.selection);
  const selection = given ?? live;
  const closeModal = useUIStore((s) => s.closeModal);
  const updateItem = useSectionStore((s) => s.updateItem);
  const setItemDates = useSectionStore((s) => s.setItemDates);
  const deleteItem = useSectionStore((s) => s.deleteItem);
  const toggleItemDone = useSectionStore((s) => s.toggleItemDone);

  const sectionId = selection.sectionId;
  const itemId = selection.id;

  const sectionSelector = useMemo(() => selectSection(sectionId), [sectionId]);
  const itemSelector = useMemo(() => selectItem(sectionId, itemId), [sectionId, itemId]);
  const liveSection = useSectionStore(sectionSelector);
  const liveItem = useSectionStore(itemSelector);

  // Undoing the bar this panel is open on takes it off the sheet, and the
  // panel closes after it (uiStore) — leaving with what it was editing still
  // in it, not an empty box. The handlers below only ever act on the live item.
  const heldRef = useRef<{ readonly item: TimelineItem; readonly section: Section } | null>(null);
  if (liveItem && liveSection) heldRef.current = { item: liveItem, section: liveSection };
  const item = heldRef.current?.item;
  const section = heldRef.current?.section;

  // Ancestors, so the panel can say where this thing lives without a title bar
  const trail = useMemo(() => {
    if (!section || !itemId) return [] as string[];
    const path = findItemPath(section.items, itemId);
    if (!path) return [section.name];
    return [section.name, ...path.slice(0, -1).map((ancestor) => ancestor.name || 'Untitled')];
  }, [section, itemId]);

  // What is typed into one field is one undo step (`typeInto`). Moving to
  // another field starts the next, and so does closing the panel.
  useEffect(() => endTypingStep, []);

  const saveName = useCallback(
    (name: string) => {
      if (!sectionId || !itemId) return;
      typeInto(`${itemId}:name`, () => updateItem(sectionId, itemId, { name }));
    },
    [sectionId, itemId, updateItem]
  );
  const nameField = useNameDraft(item?.name ?? '', saveName);

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!sectionId || !itemId) return;
      const description = e.target.value;
      typeInto(`${itemId}:description`, () => updateItem(sectionId, itemId, { description }));
    },
    [sectionId, itemId, updateItem]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (!sectionId || !itemId) return;
      updateItem(sectionId, itemId, { color });
    },
    [sectionId, itemId, updateItem]
  );

  // A date typed here moves the bar on the sheet behind the panel: it glides
  // to its new days, as it would going back to them on undo. The field reports
  // every keystroke, so typing November into an end of December passes through
  // January first; a bar's edges never cross on the way, or the store would
  // swap them and the bar would land months from anything typed. End is the
  // last day the bar covers, as anyone reads it, not its exclusive edge.
  const handleStartChange = useCallback(
    (date: Date) => {
      if (!sectionId || !itemId || !liveItem) return;
      const start = toDayKey(date);
      if (liveItem.kind === 'bar' && start >= liveItem.end) return;
      commitWithSlide(() =>
        typeInto(`${itemId}:start`, () => setItemDates(sectionId, itemId, start, liveItem.end))
      );
    },
    [sectionId, itemId, liveItem, setItemDates]
  );

  const handleEndChange = useCallback(
    (date: Date) => {
      if (!sectionId || !itemId || !liveItem) return;
      const end = endAfterLastDay(toDayKey(date));
      if (end <= liveItem.start) return;
      commitWithSlide(() =>
        typeInto(`${itemId}:end`, () => setItemDates(sectionId, itemId, liveItem.start, end))
      );
    },
    [sectionId, itemId, liveItem, setItemDates]
  );

  const handleToggleDone = useCallback(() => {
    if (!sectionId || !itemId) return;
    toggleItemDone(sectionId, itemId);
  }, [sectionId, itemId, toggleItemDone]);

  const handleDelete = useCallback(() => {
    if (!sectionId || !itemId || !liveItem) return;
    // Read it while it still exists, so the notice can name what it cost
    showItemDeletedToast(liveItem);
    // The rows below close over the gap rather than jumping into it
    commitWithSlide(() => deleteItem(sectionId, itemId));
    closeModal();
  }, [sectionId, itemId, liveItem, deleteItem, closeModal]);

  if (!item || !section) {
    return <div className="text-body text-[var(--color-text-secondary)]">Nothing selected</div>;
  }

  const isTask = item.kind === 'task';
  // A milestone or a task: one date, no colour of its own
  const isPoint = item.kind !== 'bar';
  // The whole subtree, not just the first level — that is what a delete takes
  const childCount = countItems(item.children);
  // What the bar actually paints with — an inherited colour, not the schedule's
  const effectiveColor = resolveItemColor(section, item.id);
  // Named for what goes: a bar holding others takes its group with it
  const deleteLabel =
    childCount > 0
      ? 'Delete group'
      : isTask
        ? 'Delete task'
        : isPoint
          ? 'Delete milestone'
          : 'Delete bar';

  return (
    <div className="flex flex-col gap-4" onFocus={endTypingStep}>
      <div className="text-xs text-[var(--color-text-secondary)] truncate">
        {trail.map((name, index) => (
          <span key={`${name}-${index}`}>
            {index > 0 && <span className="text-[var(--color-text-muted)]"> / </span>}
            <span className={index === 0 ? 'font-medium text-[var(--color-text-primary)]' : ''}>
              {name || 'Untitled'}
            </span>
          </span>
        ))}
      </div>

      <Input
        label="Name"
        value={nameField.value}
        onChange={nameField.onChange}
        onBlur={nameField.onBlur}
        autoFocus
        spellCheck={false}
        placeholder={isTask ? 'Task name' : isPoint ? 'Milestone name' : 'Name'}
      />

      <TextArea
        label="Description"
        value={item.description}
        onChange={handleDescriptionChange}
        placeholder="Add a description…"
      />

      {!isPoint && (
        <ColorPicker label="Color" value={effectiveColor} onChange={handleColorChange} />
      )}

      {isPoint ? (
        <DateInput label="Date" value={fromDayKey(item.start)} onChange={handleStartChange} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <DateInput
            label="Start"
            value={fromDayKey(item.start)}
            onChange={handleStartChange}
            max={fromDayKey(lastDayOf(item.end))}
          />
          <DateInput
            label="End"
            value={fromDayKey(lastDayOf(item.end))}
            onChange={handleEndChange}
            min={fromDayKey(item.start)}
          />
        </div>
      )}

      {isTask && (
        <div className="flex items-center justify-between">
          <label htmlFor="item-editor-done" className="text-body text-[var(--color-text-primary)]">
            Done
          </label>
          <Toggle id="item-editor-done" checked={item.isDone === true} onChange={handleToggleDone} />
        </div>
      )}

      {childCount > 0 && (
        <div className="text-xs text-[var(--color-text-muted)]">
          Holds {childCount} {childCount === 1 ? 'item' : 'items'} — deleting removes them too.
        </div>
      )}

      {/* A quiet action at the foot: the delete raises an Undo of its own */}
      <div className="pt-2">
        <Button variant="danger" onClick={handleDelete} className="-ml-3">
          {deleteLabel}
        </Button>
      </div>
    </div>
  );
}
