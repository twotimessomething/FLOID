import { useCallback, useState } from 'react';

interface NameDraft {
  readonly value: string;
  readonly onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onBlur: () => void;
}

interface Draft {
  /** Exactly what is in the field. */
  readonly text: string;
  /** The name that keystroke left saved. */
  readonly saved: string;
  /** The name before this run of typing began: what an empty field stands for. */
  readonly from: string;
}

/**
 * A name field that writes through as it is typed — the bar behind the panel
 * renames letter by letter — without ever saving a blank name or a stray
 * space, the same bargain inline rename makes.
 *
 * Each keystroke saves the text trimmed. An empty field saves the name it
 * started from, so clearing a name to retype it shows the old one until there
 * is a new one, and leaving it empty leaves the name as it was. The field
 * shows exactly what was typed until it is left, or until the name changes
 * under it (an undo), when it shows the saved name again.
 */
export function useNameDraft(saved: string, save: (name: string) => void): NameDraft {
  const [draft, setDraft] = useState<Draft | null>(null);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      const from = draft !== null && draft.saved === saved ? draft.from : saved;
      const name = text.trim() || from;
      setDraft({ text, saved: name, from });
      if (name !== saved) save(name);
    },
    [draft, saved, save]
  );

  const onBlur = useCallback(() => setDraft(null), []);

  const value = draft !== null && draft.saved === saved ? draft.text : saved;
  return { value, onChange, onBlur };
}
