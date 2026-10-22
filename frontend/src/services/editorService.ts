/**
 * Loads everything the editor needs for one project.
 *  1. A copy saved in this browser (video + transcript + edits + history + waveform), created when the video was uploaded.
 *  2. Otherwise, when a backend is configured, GET /projects/:projectId. The editor expects:
 *       { project?: {...}, name, duration, videoUrl (or video_url), transcript: [{start,end,text,words?}] (or { segments }),
 *         edits?: { deleted: number[], key } }
 *     This endpoint does not exist in the repo yet, so it is a proposed contract.
 */
import { getSource } from './editorStorage';
import { PREVIEW_MODE } from './projectService.js';
import type { LoadedProject, ProjectRecord, Segment } from '../types/editor';

const API_BASE: string = import.meta.env.VITE_API_BASE_URL || '';

export class EditorLoadError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}

function toSegments(t: unknown): Segment[] | null {
  let value: unknown = t;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  const list = Array.isArray(value) ? value : (value as { segments?: unknown } | null)?.segments;
  return Array.isArray(list) && list.length ? (list as Segment[]) : null;
}

export async function loadEditorProject(projectId: string): Promise<LoadedProject> {
  let local: ProjectRecord | undefined;
  try { local = await getSource(projectId); } catch { /* storage unavailable: try the server */ }

  if (local?.file) {
    return {
      projectId, name: local.name || 'Untitled project', file: local.file, videoUrl: '', duration: local.duration ?? null,
      transcript: toSegments(local.transcript), saved: local.editState || null, legacy: local.edits || null, peaks: local.peaks || null, origin: 'browser'
    };
  }
  if (PREVIEW_MODE) {
    throw new EditorLoadError('This project’s video isn’t stored in this browser. Sample projects have no video. Upload a video from the dashboard to try the editor.', 'NO_VIDEO');
  }

  let response: Response;
  try { response = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}`, { credentials: 'include' }); }
  catch { throw new EditorLoadError('We couldn’t reach the server. Check your connection and try again.', 'NETWORK'); }
  if (response.status === 401) throw new EditorLoadError('Your session has expired. Log in again to continue.', 'AUTH');
  if (response.status === 403 || response.status === 404) throw new EditorLoadError('We couldn’t find that project, or you don’t have access to it.', 'NOT_FOUND');
  if (!response.ok) throw new EditorLoadError('The server couldn’t load this project. Please try again.', 'SERVER');

  const data = await response.json().catch(() => ({}));
  const p = data.project || data;
  const videoUrl: string = p.videoUrl || p.video_url || p.sourceUrl || '';
  if (!videoUrl) throw new EditorLoadError('The server returned this project without a video URL (expected "videoUrl").', 'NO_VIDEO_URL');
  return {
    projectId, name: p.name || p.title || 'Untitled project', file: null, videoUrl,
    duration: p.duration ?? null, transcript: toSegments(p.transcript),
    saved: local?.editState || null, legacy: local?.edits || p.edits || null, peaks: local?.peaks || null, origin: 'server'
  };
}
