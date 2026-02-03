import { useStore } from 'zustand';
import { useSectionStore } from '../stores/sectionStore';

interface UndoRedoState {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo(): UndoRedoState {
  const temporalStore = useSectionStore.temporal;
  const undo = useStore(temporalStore, (state) => state.undo);
  const redo = useStore(temporalStore, (state) => state.redo);
  const pastStates = useStore(temporalStore, (state) => state.pastStates);
  const futureStates = useStore(temporalStore, (state) => state.futureStates);

  return {
    undo,
    redo,
    canUndo: pastStates.length > 0,
    canRedo: futureStates.length > 0,
  };
}
