/**
 * The contract between the app and whatever is actually holding its files —
 * a browser download on the web, NSSavePanel/NSOpenPanel through Tauri on the
 * Mac. Interfaces only: nothing here may import a runtime module, so both
 * implementations and every test double depend on the same shape.
 */

export interface FileFilter {
  /** Shown by the native dialog, e.g. "FLOID Project". */
  readonly name: string;
  /** Extensions without dots, e.g. ['floid']. */
  readonly extensions: readonly string[];
}

export interface SaveFileRequest {
  /** Full name including extension. The desktop save panel owns the final name. */
  readonly suggestedName: string;
  readonly filters: readonly FileFilter[];
  readonly data: Blob | string;
  /** Blob type for the web download; the desktop dialog ignores it. */
  readonly mimeType?: string;
}

export interface SaveFileResult {
  /** A web download is always `true`; a cancelled desktop dialog is `false`. */
  readonly saved: boolean;
  /** Where the file landed — desktop only. */
  readonly path?: string;
}

export interface OpenFilesRequest {
  readonly filters: readonly FileFilter[];
  readonly multiple?: boolean;
}

export interface OpenedFile {
  readonly name: string;
  readonly text: string;
}

export interface PickDirectoryOptions {
  /** Web picker-memory hint (`showDirectoryPicker`'s `id`); desktop ignores it. */
  readonly id?: string;
}

/**
 * An opaque, persistable grant to keep writing into one directory. The web
 * holds a live handle (structured-cloned into IndexedDB); the desktop holds a
 * path whose sandbox grant is restored out of band.
 */
export type DirectoryToken =
  | { readonly kind: 'web-handle'; readonly handle: FileSystemDirectoryHandle }
  | { readonly kind: 'desktop-path'; readonly path: string };

export interface PlatformFiles {
  saveFile(request: SaveFileRequest): Promise<SaveFileResult>;
  /** Resolves `[]` when the user cancels. */
  openFiles(request: OpenFilesRequest): Promise<readonly OpenedFile[]>;
  pickDirectory(options?: PickDirectoryOptions): Promise<DirectoryToken | null>;
  /** The persisted grant, or `null` when none is stored or it can't be honoured. */
  restoreDirectory(): Promise<DirectoryToken | null>;
  persistDirectory(token: DirectoryToken | null): Promise<void>;
  directoryDisplayName(token: DirectoryToken): string;
  writeFileInDirectory(token: DirectoryToken, filename: string, contents: string): Promise<void>;
}
