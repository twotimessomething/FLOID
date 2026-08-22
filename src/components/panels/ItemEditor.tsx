import { useCallback, useMemo } from 'react';
import { useSectionStore, selectItem, selectSection } from '../../stores/sectionStore';
import { useUIStore, showItemDeletedToast } from '../../stores/uiStore';
import { Input, TextArea, DateInput, ColorPicker, Button } from '../common';
import { countItems, findItemPath } from '../../utils/itemTree';
import { resolveItemColor } from '../../utils/timelineUtils';
import { fromDayKey, toDayKey } from '../../utils/dayKeys';
import type { SelectionState } from '../../types';

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

  const sectionId = selection.sectionId;
  const itemId = selection.id;

  const sectionSelector = useMemo(() => selectSection(sectionId), [sectionId]);
  const itemSelector = useMemo(() => selectItem(sectionId, itemId), [sectionId, itemId]);
  const section = useSectionStore(sectionSelector);
  const item = useSectionStore(itemSelector);

  // Ancestors, so the panel can say where this thing lives without a title bar
  const trail = useMemo(() => {
    if (!section || !itemId) return [] as string[];
    const path = findItemPath(section.items, itemId);
    if (!path) return [section.name];
    return [section.name, ...path.slice(0, -1).map((ancestor) => ancestor.name || 'Untitled')];
  }, [section, itemId]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sectionId || !itemId) return;
      updateItem(sectionId, itemId, { name: e.target.value });
    },
    [sectionId, itemId, updateItem]
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!sectionId || !itemId) return;
      updateItem(sectionId, itemId, { description: e.target.value });
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

  const handleStartChange = useCallback(
    (date: Date) => {
      if (!sectionId || !itemId || !item) return;
      setItemDates(sectionId, itemId, toDayKey(date), item.end);
    },
    [sectionId, itemId, item, setItemDates]
  );

  const handleEndChange = useCallback(
    (date: Date) => {
      if (!sectionId || !itemId || !item) return;
      setItemDates(sectionId, itemId, item.start, toDayKey(date));
    },
    [sectionId, itemId, item, setItemDates]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !itemId || !item) return;
    // Read it while it still exists, so the notice can name what it cost
    showItemDeletedToast(item);
    deleteItem(sectionId, itemId);
    closeModal();
  }, [sectionId, itemId, item, deleteItem, closeModal]);

  if (!item || !section) {
    return <div className="text-body text-[var(--color-text-secondary)]">Nothing selected</div>;
  }

  const isMilestone = item.kind === 'milestone';
  // The whole subtree, not just the first level — that is what a delete takes
  const childCount = countItems(item.children);
  // What the bar actually paints with — an inherited colour, not the schedule's
  const effectiveColor = resolveItemColor(section, item.id);

  return (
    <div className="flex flex-col gap-4">
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
        value={item.name}
        onChange={handleNameChange}
        autoFocus
        placeholder={isMilestone ? 'Milestone name' : 'Name'}
      />

      <TextArea
        label="Description"
        value={item.description}
        onChange={handleDescriptionChange}
        placeholder="Add a description..."
      />

      {!isMilestone && (
        <ColorPicker label="Color" value={effectiveColor} onChange={handleColorChange} />
      )}

      {isMilestone ? (
        <DateInput label="Date" value={fromDayKey(item.start)} onChange={handleStartChange} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <DateInput
            label="Start"
            value={fromDayKey(item.start)}
            onChange={handleStartChange}
            max={fromDayKey(item.end)}
          />
          <DateInput
            label="End"
            value={fromDayKey(item.end)}
            onChange={handleEndChange}
            min={fromDayKey(item.start)}
          />
        </div>
      )}

      {childCount > 0 && (
        <div className="text-xs text-[var(--color-text-muted)]">
          Holds {childCount} {childCount === 1 ? 'item' : 'items'} — deleting removes them too.
        </div>
      )}

      <div className="pt-2">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete
        </Button>
      </div>
    </div>
  );
}
