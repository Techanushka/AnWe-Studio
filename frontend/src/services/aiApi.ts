const API_BASE: string = import.meta.env.VITE_API_BASE_URL || '';

export interface HighlightClip { id: string; title: string; start: number; end: number; duration: number; reason: string; score: number }
export interface HighlightResult { highlights: HighlightClip[]; provider: string; warning?: string; truncated?: boolean }

/** POST /projects/:id/ai/highlights (needs the transcript saved on the server). */
export async function fetchHighlights(projectId: string, body: { min_seconds: number; max_seconds: number; count: number }, signal?: AbortSignal): Promise<HighlightResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/ai/highlights`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('We couldn’t reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Your session has expired. Log in again to continue.');
  if (!res.ok) throw new Error(data.message || (typeof data.detail === 'string' ? data.detail : '') || `The server returned an error (${res.status}).`);
  return data as HighlightResult;
}
