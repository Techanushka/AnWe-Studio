import { useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useHighlightStore } from '../../store/highlightStore';
import { clipPieces, planRender, safeName } from '../../utils/exportJobs';
import { downloadBlob, renderVideo } from '../../utils/render';
import type { RenderSource } from '../../utils/render';
import { formatTime } from '../../utils/transcript.js';

const TARGETS = [{ label: '15–30 s', min: 15, max: 30 }, { label: '30–60 s', min: 30, max: 60 }, { label: '60–90 s', min: 60, max: 90 }];
const COUNTS = [3, 5, 8];

/** Feature 6: generate highlight clips, approve the ones you like, export each as its own video. */
export default function HighlightsPanel({ projectId, name, source, onSeek }: { projectId: string; name: string; source: RenderSource; onSeek: (t: number) => void }) {
  const { min, max, count, clips, status, error, warning, provider } = useHighlightStore();
  const { setTarget, setCount, generate, toggle, setAll } = useHighlightStore.getState();
  const [burn, setBurn] = useState(true);
  const [job, setJob] = useState<{ i: number; n: number; p: number; stage: string } | null>(null);
  const [exportError, setExportError] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const chosen = clips.filter((c) => c.selected);
  const local = projectId.startsWith('local-');

  async function exportAll() {
    setExportError('');
    const c = new AbortController();
    ctl.current = c;
    const todo = useHighlightStore.getState().clips.filter((x) => x.selected);
    try {
      for (let i = 0; i < todo.length; i++) {
        const clip = todo[i];
        const plan = planRender(clipPieces(useEditorStore.getState().keep, { start: clip.start, end: clip.end }), burn);
        setJob({ i, n: todo.length, p: 0, stage: 'Starting…' });
        const blob = await renderVideo({ source, ...plan, signal: c.signal, onProgress: (p, stage) => setJob({ i, n: todo.length, p, stage }) });
        downloadBlob(`${safeName(name)}-clip-${i + 1}-${safeName(clip.title).slice(0, 30)}.mp4`, blob);
        await new Promise((r) => setTimeout(r, 400)); // let the browser start the previous download
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setExportError((e as Error).message || 'Export failed.');
    } finally { setJob(null); ctl.current = null; }
  }

  return (
    <section className="ed-highlights" aria-labelledby="hl-h">
      <div className="ed-cuts-head"><h2 id="hl-h">AI highlights <span className="count">{clips.length}</span></h2></div>
      <p className="muted ed-help">Finds the strongest moments, with a title, timestamps and a reason. You approve which ones to export.</p>
      {local && <p className="msg info">This project only exists in this browser. Upload it from the dashboard so the server can analyse the transcript.</p>}

      <div className="aspects" role="radiogroup" aria-label="Clip length">
        {TARGETS.map((t) => <button key={t.label} type="button" role="radio" aria-checked={min === t.min && max === t.max} className={`aspect${min === t.min && max === t.max ? ' is-on' : ''}`} onClick={() => setTarget(t.min, t.max)}>{t.label}</button>)}
      </div>
      <div className="cl-opts">
        <label className="hl-count">Clips
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <button type="button" className="btn primary sm" onClick={() => void generate(projectId)} disabled={status === 'loading' || local}>
          {status === 'loading' ? <><i className="spin" aria-hidden="true" />Analysing…</> : clips.length ? 'Generate again' : 'Generate highlights'}
        </button>
      </div>

      {status === 'error' && <p className="msg bad" role="alert">{error}</p>}
      {warning && <p className="msg info">{warning}</p>}

      {clips.length > 0 && (
        <>
          <div className="cl-summary">
            <span><b>{chosen.length}</b> of {clips.length} selected <span className="muted">· {provider === 'gemini' ? 'AI scored' : 'local scorer'}</span></span>
            <span className="cl-bulk">
              <button type="button" className="btn ghost sm" onClick={() => setAll(true)}>All</button>
              <button type="button" className="btn ghost sm" onClick={() => setAll(false)}>None</button>
            </span>
          </div>
          <ul className="hl-list">
            {clips.map((c) => (
              <li key={c.id} className={`hl-card${c.selected ? ' is-on' : ''}`}>
                <label className="hl-pick">
                  <input type="checkbox" checked={c.selected} onChange={() => toggle(c.id)} aria-label={`Select clip: ${c.title}`} />
                  <span className="hl-title">{c.title}</span>
                  <span className="hl-score" title="Highlight score out of 10">{c.score.toFixed(1)}</span>
                </label>
                <div className="hl-meta">
                  <button type="button" className="ts" onClick={() => onSeek(c.start)} title="Jump to the start of this clip">{formatTime(c.start)}–{formatTime(c.end)}</button>
                  <span className="muted">{Math.round(c.duration)}s</span>
                </div>
                {c.reason && <p className="hl-reason">{c.reason}</p>}
              </li>
            ))}
          </ul>

          <label className="switch cap-main"><input type="checkbox" checked={burn} onChange={(e) => setBurn(e.target.checked)} /><span>Burn captions into the clips</span></label>
          {job ? (
            <div className="cap-export">
              <div className="progress slim" role="progressbar" aria-valuenow={Math.round(job.p * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.round(job.p * 100)}%` }} /></div>
              <p className="status"><i className="spin" aria-hidden="true" />Clip {job.i + 1} of {job.n}: {job.stage} {Math.round(job.p * 100)}%</p>
              <button type="button" className="btn ghost sm" onClick={() => ctl.current?.abort()}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="btn primary sm" onClick={() => void exportAll()} disabled={!chosen.length}>Export {chosen.length} clip{chosen.length === 1 ? '' : 's'} (.mp4)</button>
          )}
          <p className="muted ed-help">Each clip respects your cuts, trim and crop. Your browser may ask to allow multiple downloads.</p>
          {exportError && <p className="msg bad" role="alert">{exportError}</p>}
        </>
      )}
    </section>
  );
}
