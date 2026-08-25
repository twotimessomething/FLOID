/**
 * Tauri injects `__TAURI_INTERNALS__` before any page script runs, so this is
 * decidable at first call and never changes within a session.
 */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
