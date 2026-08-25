import { getFileHandle, setFileHandle } from '../utils/indexedDB';
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
 * Browser implementation: a save is an anchor download (which cannot be
 * cancelled or observed, so it always reports saved), an open is a hidden
 * file input, and directories come from the File System Access API where the
 * browser has it.
 */

interface DirectoryPickerWindow {
  showDirectoryPicker: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  }) => Promise<FileSystemDirectoryHandle>;
}

interface PermissionedHandle {
  queryPermission: (opts: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission: (opts: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

async function verifyHandlePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permissioned = handle as unknown as PermissionedHandle;
  const opts = { mode: 'readwrite' as const };
  if ((await permissioned.queryPermission(opts)) === 'granted') return true;
  return (await permissioned.requestPermission(opts)) === 'granted';
}

export const webFiles: PlatformFiles = {
  async saveFile(request: SaveFileRequest): Promise<SaveFileResult> {
    const blob =
      typeof request.data === 'string'
        ? new Blob([request.data], { type: request.mimeType ?? 'application/octet-stream' })
        : request.data;
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = request.suggestedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { saved: true };
  },

  openFiles(request: OpenFilesRequest): Promise<readonly OpenedFile[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = request.filters
        .flatMap((filter) => filter.extensions.map((ext) => `.${ext}`))
        .join(',');
      input.multiple = request.multiple ?? false;

      input.onchange = async () => {
        const files = Array.from(input.files ?? []);
        const opened = await Promise.all(
          files.map(async (file): Promise<OpenedFile> => ({ name: file.name, text: await file.text() }))
        );
        resolve(opened);
      };
      // Fired by modern browsers when the dialog is dismissed
      input.addEventListener('cancel', () => resolve([]));

      input.click();
    });
  },

  async pickDirectory(options?: PickDirectoryOptions): Promise<DirectoryToken | null> {
    if (!('showDirectoryPicker' in window)) return null;
    try {
      const handle = await (window as unknown as DirectoryPickerWindow).showDirectoryPicker({
        id: options?.id,
        mode: 'readwrite',
        startIn: 'documents',
      });
      return { kind: 'web-handle', handle };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
  },

  async restoreDirectory(): Promise<DirectoryToken | null> {
    const handle = await getFileHandle();
    return handle ? { kind: 'web-handle', handle } : null;
  },

  async persistDirectory(token: DirectoryToken | null): Promise<void> {
    await setFileHandle(token?.kind === 'web-handle' ? token.handle : null);
  },

  directoryDisplayName(token: DirectoryToken): string {
    return token.kind === 'web-handle' ? token.handle.name : token.path.split('/').pop() ?? token.path;
  },

  async writeFileInDirectory(
    token: DirectoryToken,
    filename: string,
    contents: string
  ): Promise<void> {
    if (token.kind !== 'web-handle') {
      throw new Error('Web platform cannot write to a desktop directory token');
    }
    if (!(await verifyHandlePermission(token.handle))) {
      throw new Error('Permission denied to write to folder');
    }
    const fileHandle = await token.handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
  },
};
