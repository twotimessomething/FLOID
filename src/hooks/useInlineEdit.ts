import { useState, useCallback, useRef, useEffect } from 'react';

interface InlineEditState {
  editingId: string | null;
  editedName: string;
}

interface UseInlineEditReturn {
  editingId: string | null;
  editedName: string;
  startEditing: (id: string, currentName: string) => void;
  saveEdit: (updateFn: (trimmedName: string) => void) => void;
  cancelEdit: () => void;
  handleKeyDown: (e: React.KeyboardEvent, updateFn: (trimmedName: string) => void) => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

export function useInlineEdit(): UseInlineEditReturn {
  const [state, setState] = useState<InlineEditState>({
    editingId: null,
    editedName: '',
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback((id: string, currentName: string) => {
    setState({ editingId: id, editedName: currentName });
  }, []);

  const cancelEdit = useCallback(() => {
    setState({ editingId: null, editedName: '' });
  }, []);

  const saveEdit = useCallback(
    (updateFn: (trimmedName: string) => void) => {
      if (state.editingId === null) return;
      const trimmed = state.editedName.trim();
      if (trimmed !== '') {
        updateFn(trimmed);
      }
      setState({ editingId: null, editedName: '' });
    },
    [state.editingId, state.editedName]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, updateFn: (trimmedName: string) => void) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit(updateFn);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setState((prev) => ({ ...prev, editedName: e.target.value }));
  }, []);

  // Focus and select input on mount
  useEffect(() => {
    if (state.editingId !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [state.editingId]);

  return {
    editingId: state.editingId,
    editedName: state.editedName,
    startEditing,
    saveEdit,
    cancelEdit,
    handleKeyDown,
    handleChange,
    inputRef,
  };
}
