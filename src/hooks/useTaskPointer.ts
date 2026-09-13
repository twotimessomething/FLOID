import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';

/** The key that turns the pointer into a task pointer while it is down. */
const TASK_POINTER_KEY = 'Alt';

/**
 * Hold ⌥ and the pointer becomes a task pointer: open paper previews a circle
 * instead of a bar, and one click drops a task on that day in that row. Let
 * go and the pointer is a pointer again. Nothing latches — a mode that can be
 * left on is a trap, and a held key cannot be forgotten.
 *
 * The state lives in the store so every row can preview the right thing
 * without the pointer having to move; the body class carries the cursor.
 * Focus leaving the window is treated as the key coming up, because the
 * keyup that would have said so goes to whatever took the focus.
 */
export function useTaskPointer(): void {
  const setTaskPointer = useUIStore((s) => s.setTaskPointer);
  const isTaskPointer = useUIStore((s) => s.isTaskPointer);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === TASK_POINTER_KEY && !e.repeat) setTaskPointer(true);
    };
    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key === TASK_POINTER_KEY) setTaskPointer(false);
    };
    const release = (): void => setTaskPointer(false);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', release);
    };
  }, [setTaskPointer]);

  useEffect(() => {
    document.body.classList.toggle('task-pointer', isTaskPointer);
    return () => document.body.classList.remove('task-pointer');
  }, [isTaskPointer]);
}

/** Whether the pointer is a task pointer right now. */
export function useIsTaskPointer(): boolean {
  return useUIStore((s) => s.isTaskPointer);
}
