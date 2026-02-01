import { useCallback, useMemo } from 'react';
import { useSectionStore, selectSection } from '../../stores/sectionStore';
import { useUIStore } from '../../stores/uiStore';
import { Input, ColorPicker, Button } from '../common';

export function SectionEditor(): JSX.Element {
  const { selection, closeModal } = useUIStore();
  const { updateSection, deleteSection } = useSectionStore();

  const sectionId = selection.sectionId;

  // Memoize selector to prevent recreation on every render
  const sectionSelector = useMemo(() => selectSection(sectionId || ''), [sectionId]);
  const section = useSectionStore(sectionSelector);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sectionId) return;
      updateSection(sectionId, { name: e.target.value });
    },
    [sectionId, updateSection]
  );

  const handleColorChange = useCallback(
    (color: string) => {
      if (!sectionId) return;
      updateSection(sectionId, { color });
    },
    [sectionId, updateSection]
  );

  const handleDelete = useCallback(() => {
    if (!sectionId || !section) return;
    if (confirm(`Delete team "${section.name}"? This will also delete all phases and elements within it.`)) {
      deleteSection(sectionId);
      closeModal();
    }
  }, [sectionId, section, deleteSection, closeModal]);

  if (!section) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Team not found</div>;
  }

  // Only team sections can be edited as sections (ID timeline cannot be deleted)
  if (section.type === 'id-timeline') {
    return <div className="text-sm text-[var(--color-text-secondary)]">The Industrial Design section cannot be edited as a section.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Team Name"
        value={section.name}
        onChange={handleNameChange}
        autoFocus
        placeholder="Team name"
      />

      <ColorPicker
        label="Color"
        value={section.color}
        onChange={handleColorChange}
      />

      <div className="pt-4 border-t border-[var(--color-border)]">
        <Button variant="danger" onClick={handleDelete} className="w-full">
          Delete Team
        </Button>
      </div>
    </div>
  );
}
