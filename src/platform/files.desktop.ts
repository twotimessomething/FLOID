import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { getAppSettings, setAppSettings } from '../utils/indexedDB';
import type {
  DirectoryToken,
  OpenedFile,
  OpenFilesRequest,
  PlatformFiles,
  SaveFileRequest,
  SaveFileResult,
} from './types';

/**
 * Tauri implementation: NSSavePanel/NSOpenPanel through the dialog plugin,
 * writes through the fs plugin. Every path the app touches is granted by the
 * dialog that chose it (the plugin extends the fs scope), by the Finder-open
 * handler in Rust, or restored across launches by persisted-scope — no static
 * scope, which is what the App Store sandbox wants to see.
 */

const toDialogFilters = (
  filters: SaveFileRequest['filters']
): { name: string; extensions: string[] }[] =>
  filters.map((filter) => ({ name: filter.name, extensions: [...filter.extensions] }));

const basename = (path: string): string => path.split('/').pop() ?? path;

export const desktopFiles: PlatformFiles = {
  async saveFile(request: SaveFileRequest): Promise<SaveFileResult> {
    const path = await save({
      defaultPath: request.suggestedName,
      filters: toDialogFilters(request.filters),
    });
    if (path === null) return { saved: false };

    if (typeof request.data === 'string') {
      await writeTextFile(path, request.data);
    } else {
      await writeFile(path, new Uint8Array(await request.data.arrayBuffer()));
    }
    return { saved: true, path };
  },

  async openFiles(request: OpenFilesRequest): Promise<readonly OpenedFile[]> {
    const selection = await open({
      multiple: request.multiple ?? false,
      directory: false,
      filters: toDialogFilters(request.filters),
    });
    if (selection === null) return [];

    const paths = Array.isArray(selection) ? selection : [selection];
    return Promise.all(
      paths.map(async (path): Promise<OpenedFile> => ({
        name: basename(path),
        text: await readTextFile(path),
      }))
    );
  },

  async pickDirectory(): Promise<DirectoryToken | null> {
    const path = await open({ directory: true, multiple: false });
    if (path === null || Array.isArray(path)) return null;
    return { kind: 'desktop-path', path };
  },

  /**
   * Unreachable today: `supportsFolderAutoSave()` is false on desktop, and
   * autosave is the only caller. Left in place because it is the shape the
   * real fix takes — but do not wire it up without first creating a
   * security-scoped bookmark in Rust. A bare path string is not a grant under
   * the sandbox, and restoring one produces a folder the app cannot write to.
   */
  async restoreDirectory(): Promise<DirectoryToken | null> {
    const settings = await getAppSettings();
    const path = settings.autoSaveDirectoryPath;
    return path ? { kind: 'desktop-path', path } : null;
  },

  async persistDirectory(token: DirectoryToken | null): Promise<void> {
    await setAppSettings({
      autoSaveDirectoryPath: token?.kind === 'desktop-path' ? token.path : null,
    });
  },

  directoryDisplayName(token: DirectoryToken): string {
    return token.kind === 'desktop-path' ? basename(token.path) : token.handle.name;
  },

  async writeFileInDirectory(
    token: DirectoryToken,
    filename: string,
    contents: string
  ): Promise<void> {
    if (token.kind !== 'desktop-path') {
      throw new Error('Desktop platform cannot write to a web directory token');
    }
    await writeTextFile(`${token.path}/${filename}`, contents);
  },
};
