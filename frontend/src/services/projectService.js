/**
 * Project API layer. Presentation components never call fetch directly.
 *
 * BACKEND CONTRACT STILL NEEDED (none of these exist in the repo yet). All use cookie auth
 * (credentials: 'include') and must only return/modify projects owned by the signed-in user:
 *
 *   GET    /projects                 -> [project] or { projects: [project] }
 *   POST   /projects                 -> multipart: video (file), name, duration?, transcript? (JSON [{start,end,text}]) -> project (or { project })
 *   PATCH  /projects/:projectId      -> { name } -> project
 *   POST   /projects/:projectId/duplicate -> project
 *   DELETE /projects/:projectId      -> 204 / { ok: true }
 *   GET    /exports                  -> [export] or { exports: [export] }
 *
 *   project = { projectId, name, thumbnail, duration (seconds), status: draft|processing|ready, createdAt, updatedAt }
 *   export  = { exportId, name, projectId, createdAt, format, resolution, downloadUrl? }
 *
 * When VITE_API_BASE_URL is empty the service runs in PREVIEW MODE: sample data kept in memory,
 * clearly flagged with isMock, and nothing is uploaded or processed.
 */
import { API_CONFIGURED } from './authService.js';
import { createMockProjects } from '../data/mockProjects.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
export const PREVIEW_MODE = !API_CONFIGURED;

export class ProjectServiceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ProjectServiceError';
    this.status = status;
  }
}

export function projectErrorMessage(error) {
  if (error?.message === 'NETWORK') return 'We couldn’t reach the server. Check your connection and try again.';
  if (error?.status === 401) return 'Your session has expired. Log in again to continue.';
  if (error?.status === 403) return 'You don’t have access to that project.';
  if (error?.status === 404) return 'We couldn’t find that. It may have been deleted, or the server doesn’t support it yet.';
  if (error?.status === 413) return 'That video is larger than the server allows.';
  if (error?.status === 415) return 'The server doesn’t accept that video format.';
  if (error?.message && error.message !== 'REQUEST_FAILED') return error.message;
  return 'Something went wrong. Please try again.';
}

const STATUS_MAP = {
  draft: 'draft', processing: 'processing', queued: 'processing', transcribing: 'processing',
  ready: 'ready', completed: 'ready', complete: 'ready', done: 'ready', failed: 'failed', error: 'failed', pending: 'draft'
};

export function normalizeProject(raw) {
  const now = new Date().toISOString();
  const duration = raw.duration == null || Number.isNaN(Number(raw.duration)) ? null : Number(raw.duration);
  return {
    projectId: String(raw.projectId ?? raw.project_id ?? raw.id ?? raw._id),
    name: raw.name || raw.title || 'Untitled project',
    thumbnail: raw.thumbnail || raw.thumbnailUrl || raw.thumbnail_url || null,
    duration,
    status: STATUS_MAP[String(raw.status || 'draft').toLowerCase()] || 'draft',
    createdAt: raw.createdAt || raw.created_at || raw.updatedAt || raw.updated_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at || now,
    isMock: Boolean(raw.isMock),
    isLocalDraft: Boolean(raw.isLocalDraft)
  };
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ProjectServiceError('NETWORK');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ProjectServiceError(data?.message || 'REQUEST_FAILED', response.status);
  return data;
}

function uploadWithProgress(path, formData, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* empty body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ProjectServiceError(data?.message || 'REQUEST_FAILED', xhr.status));
    };
    xhr.onerror = () => reject(new ProjectServiceError('NETWORK'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(formData);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let mockStore = null;
const store = () => (mockStore ??= createMockProjects());
const unwrap = (data, key) => (Array.isArray(data) ? data : data?.[key] || []);

export const projectService = {
  async listProjects() {
    if (PREVIEW_MODE) { await wait(350); return store().map(normalizeProject); }
    return unwrap(await request('/projects'), 'projects').map(normalizeProject);
  },

  /** Creates a project from a video file. Preview mode only makes a local draft: nothing is uploaded. */
  async createProject(file, { duration, onProgress, signal, transcript } = {}) {
    const name = file.name.replace(/\.[^.]+$/, '') || 'Untitled project';
    if (PREVIEW_MODE) {
      await wait(500);
      const now = new Date().toISOString();
      const draft = { projectId: `local-${Date.now()}`, name, thumbnail: null, duration: duration ?? null, status: 'draft', createdAt: now, updatedAt: now, isMock: true, isLocalDraft: true };
      store().unshift(draft);
      return normalizeProject(draft);
    }
    const form = new FormData();
    form.append('video', file);
    form.append('name', name);
    if (duration != null) form.append('duration', String(Math.round(duration)));
    // Transcript made in the browser: [{ start, end, text }] in seconds. Backend can store it (field: transcript, JSON).
    if (transcript?.length) form.append('transcript', JSON.stringify(transcript));
    const data = await uploadWithProgress('/projects', form, { onProgress, signal });
    return normalizeProject(data?.project || data);
  },

  async renameProject(projectId, name) {
    if (PREVIEW_MODE) {
      await wait(200);
      const item = store().find((p) => p.projectId === projectId);
      if (item) { item.name = name; item.updatedAt = new Date().toISOString(); }
      return normalizeProject(item || { projectId, name });
    }
    const data = await request(`/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: { name } });
    return normalizeProject(data?.project || data);
  },

  async duplicateProject(projectId) {
    if (PREVIEW_MODE) {
      await wait(250);
      const source = store().find((p) => p.projectId === projectId);
      const now = new Date().toISOString();
      const copy = { ...source, projectId: `${projectId}-copy-${Date.now()}`, name: `${source.name} (copy)`, status: 'draft', createdAt: now, updatedAt: now };
      store().unshift(copy);
      return normalizeProject(copy);
    }
    const data = await request(`/projects/${encodeURIComponent(projectId)}/duplicate`, { method: 'POST', body: {} });
    return normalizeProject(data?.project || data);
  },

  async deleteProject(projectId) {
    if (PREVIEW_MODE) { await wait(200); mockStore = store().filter((p) => p.projectId !== projectId); return; }
    await request(`/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  },

  /** Exports are not implemented anywhere yet; missing endpoint (404/501) just means "no exports". */
  async listExports() {
    if (PREVIEW_MODE) return [];
    try {
      return unwrap(await request('/exports'), 'exports').map((item) => ({
        exportId: String(item.exportId ?? item.id),
        name: item.name || 'Untitled export',
        projectId: item.projectId ?? item.project_id ?? null,
        createdAt: item.createdAt || item.created_at,
        format: item.format || '',
        resolution: item.resolution || '',
        downloadUrl: item.downloadUrl || item.download_url || null
      }));
    } catch (error) {
      if (error.status === 404 || error.status === 501) return [];
      throw error;
    }
  }
};
