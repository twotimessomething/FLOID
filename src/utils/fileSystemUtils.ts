import type { DependencyEdge, Project, Section } from '../types';
import { exportProjectToJson } from './exportUtils';
import { sanitizeFilename } from './stringUtils';

// Check if the File System Access API is supported
export const isFileSystemAccessSupported = (): boolean => {
  return 'showDirectoryPicker' in window;
};

// Request directory access from the user
export async function requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;

  try {
    // TypeScript doesn't have full types for the File System Access API
    const handle = await (window as unknown as { showDirectoryPicker: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
    }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
      id: 'floid-autosave',
      mode: 'readwrite',
      startIn: 'documents',
    });
    return handle;
  } catch (e) {
    // User cancelled the picker
    if ((e as Error).name === 'AbortError') return null;
    throw e;
  }
}

// Verify we still have permission to access the directory
export async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };

  // Check if permission is already granted
  const queryResult = await (handle as unknown as {
    queryPermission: (opts: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  }).queryPermission(opts);

  if (queryResult === 'granted') return true;

  // Request permission if needed
  const requestResult = await (handle as unknown as {
    requestPermission: (opts: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  }).requestPermission(opts);

  return requestResult === 'granted';
}

// Write project data to the directory
export async function writeProjectToFolder(
  handle: FileSystemDirectoryHandle,
  project: Project,
  sections: Section[],
  dependencies: DependencyEdge[] = []
): Promise<void> {
  // Verify permission first
  if (!await verifyPermission(handle)) {
    throw new Error('Permission denied to write to folder');
  }

  const filename = `${sanitizeFilename(project.name)}.floid`;
  const data = exportProjectToJson(project, sections, dependencies);
  const content = JSON.stringify(data, null, 2);

  // Get or create the file
  const fileHandle = await handle.getFileHandle(filename, { create: true });

  // Write the content
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}
