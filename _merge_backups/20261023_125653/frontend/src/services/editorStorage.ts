/**
 * Browser-side project storage (IndexedDB). Keeps the video file, its transcript, the waveform peaks and the
 * saved edit state (current edits + undo history) so /editor/:projectId can reopen a project after a reload.
 * Works with or without a backend.
 */
import type { ProjectRecord, SavedHistory, Segment } from '../types/editor';

const DB_NAME = 'anwe-studio';
const STORE = 'projectSources';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is not available in this browser.')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'projectId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const getSource = (projectId: string): Promise<ProjectRecord | undefined> => run('readonly', (s) => s.get(projectId));
export const putSource = (record: ProjectRecord): Promise<IDBValidKey> => run('readwrite', (s) => s.put({ ...record, updatedAt: Date.now() }));

/** Read-modify-write inside ONE transaction, so two quick saves can't overwrite each other. */
export async function patchSource(projectId: string, patch: Partial<ProjectRecord>): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const get = store.get(projectId);
      get.onsuccess = () => store.put({ ...(get.result || {}), ...patch, projectId, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const saveEditState = (projectId: string, editState: SavedHistory) => patchSource(projectId, { editState });
export const saveTranscript = (projectId: string, transcript: Segment[]) => patchSource(projectId, { transcript, edits: null, editState: null });
export const savePeaks = (projectId: string, peaks: Uint8Array) => patchSource(projectId, { peaks });
export const removeSource = (projectId: string): Promise<undefined> => run('readwrite', (s) => s.delete(projectId)) as Promise<undefined>;
