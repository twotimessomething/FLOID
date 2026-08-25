import { isDesktop } from './detect';
import type {
  DirectoryToken,
  OpenedFile,
  OpenFilesRequest,
  PickDirectoryOptions,
  PlatformFiles,
  SaveFileRequest,
  SaveFileResult,
} from './types';

/**
 * The one module call sites import. The implementation behind it is loaded
 * lazily, so the web bundle never fetches the desktop chunk (or its
 * `@tauri-apps` dependencies) and vice versa. Every operation here is already
 * async at its call sites, so the lazy hop costs nothing.
 */

let implPromise: Promise<PlatformFiles> | null = null;

function impl(): Promise<PlatformFiles> {
  implPromise ??= isDesktop()
    ? import('./files.desktop').then((m) => m.desktopFiles)
    : import('./files.web').then((m) => m.webFiles);
  return implPromise;
}

export async function saveFile(request: SaveFileRequest): Promise<SaveFileResult> {
  return (await impl()).saveFile(request);
}

export async function openFiles(request: OpenFilesRequest): Promise<readonly OpenedFile[]> {
  return (await impl()).openFiles(request);
}

/**
 * Sync on purpose — render code gates on it. Decidable without loading an
 * implementation: the desktop always has directories, the web only where the
 * File System Access API exists.
 */
export function supportsDirectorySave(): boolean {
  return isDesktop() || (typeof window !== 'undefined' && 'showDirectoryPicker' in window);
}

/**
 * Whether a folder grant can *survive a relaunch* — a strictly narrower thing
 * than `supportsDirectorySave`, and the one autosave actually needs.
 *
 * On the web the File System Access API hands back a handle that persists in
 * IndexedDB and can be re-permissioned, so autosave works. Under the macOS App
 * Sandbox it does not: permission to write into a folder chosen in an earlier
 * launch comes from a security-scoped bookmark, and nothing here creates one —
 * the `files.bookmarks.app-scope` entitlement grants the right to make
 * bookmarks, not the bookmarks themselves. Autosave would appear to work, then
 * silently stop writing after the first quit.
 *
 * Writing several files into a folder *now* is unaffected, because the open
 * panel grants access for that session — which is why multi-file export still
 * asks `supportsDirectorySave` and still works on the Mac.
 *
 * Implementing bookmarks in Rust would flip this to `true` on desktop; that is
 * the only change needed here.
 */
export function supportsFolderAutoSave(): boolean {
  return !isDesktop() && typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickDirectory(
  options?: PickDirectoryOptions
): Promise<DirectoryToken | null> {
  return (await impl()).pickDirectory(options);
}

export async function restoreDirectory(): Promise<DirectoryToken | null> {
  return (await impl()).restoreDirectory();
}

export async function persistDirectory(token: DirectoryToken | null): Promise<void> {
  return (await impl()).persistDirectory(token);
}

export async function directoryDisplayName(token: DirectoryToken): Promise<string> {
  return (await impl()).directoryDisplayName(token);
}

export async function writeFileInDirectory(
  token: DirectoryToken,
  filename: string,
  contents: string
): Promise<void> {
  return (await impl()).writeFileInDirectory(token, filename, contents);
}
