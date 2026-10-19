import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getProjectData, setProjectData, setProjectsIndex } from '../utils/indexedDB';
import type { StoredData } from '../utils/storageUtils';

/**
 * Just enough IndexedDB to tell a request's success from its transaction's.
 * Every request succeeds; `commitOutcome` decides what the transaction does
 * after it — which is exactly where a quota overrun shows up in a browser.
 */
const fake = {
  commitOutcome: 'complete' as 'complete' | 'abort',
  records: new Map<string, unknown>(),
};

function installFakeIndexedDB(): void {
  const transaction = (): unknown => {
    const tx: Record<string, unknown> = { error: null };
    const request = (result: () => unknown): Record<string, unknown> => {
      const req: Record<string, unknown> = { result: undefined, error: null };
      queueMicrotask(() => {
        req.result = result();
        (req.onsuccess as (() => void) | undefined)?.();
        queueMicrotask(() => {
          if (fake.commitOutcome === 'complete') {
            (tx.oncomplete as (() => void) | undefined)?.();
          } else {
            tx.error = new DOMException('Quota exceeded', 'QuotaExceededError');
            (tx.onabort as (() => void) | undefined)?.();
          }
        });
      });
      return req;
    };
    tx.objectStore = () => ({
      put: (value: { id?: string; key?: string }) =>
        request(() => {
          const key = value.id ?? value.key ?? '';
          if (fake.commitOutcome === 'complete') fake.records.set(key, value);
          return key;
        }),
      get: (key: string) => request(() => fake.records.get(key)),
    });
    return tx;
  };

  const db = { objectStoreNames: { contains: () => true }, transaction };
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open: () => {
        const req: Record<string, unknown> = { result: db };
        queueMicrotask(() => (req.onsuccess as (() => void) | undefined)?.());
        return req;
      },
    },
  });
}

const STORED: StoredData = {
  project: {
    id: 'p1',
    name: 'Alpha',
    pinnedSectionId: null,
    projectStartDate: '2026-01-01',
    projectEndDate: '2026-06-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  sections: [],
};

beforeAll(installFakeIndexedDB);

beforeEach(() => {
  fake.commitOutcome = 'complete';
  fake.records.clear();
});

describe('IndexedDB writes report the transaction, not the request', () => {
  it('resolves once the transaction commits', async () => {
    await expect(setProjectData('p1', STORED)).resolves.toBeUndefined();
    await expect(getProjectData('p1')).resolves.toEqual(STORED);
  });

  it('rejects a write whose request succeeded but whose transaction aborted', async () => {
    fake.commitOutcome = 'abort';
    await expect(setProjectData('p1', STORED)).rejects.toMatchObject({
      name: 'QuotaExceededError',
    });
  });

  it('lets a refused index write reach the caller too', async () => {
    fake.commitOutcome = 'abort';
    await expect(setProjectsIndex([])).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });
});
