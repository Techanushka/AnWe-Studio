import { useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useCaptionStore } from '../../store/captionStore';
import { FONTS } from '../../utils/captions';
import type { CapPosition, FontId } from '../../utils/captions';
import { planRender, safeName } from '../../utils/exportJobs';
import { downloadBlob, renderVideo } from '../../utils/render';
import type { RenderSource } from '../../utils/render';

const POSITIONS: Array<{ id: CapPosition; label: string }> = [{ id: 'top', label: 'Top' }, { id: 'middle', label: 'Middle' }, { id: 'bottom', label: 'Bottom' }];

/** Feature 5: caption style controls (live in the preview) and "export video with captions burned in". */
export default function CaptionsPanel({ source, name }: { source: RenderSource; name: string }) {
  const style = useCaptionStore((s) => s.style);
  const { patch, reset } = useCaptionStore.getState();
  const estimated = useEditorStore((s) => s.words.some((w) => w.estimated));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const ctl = useRef<AbortController | null>(null);

  async function run() {
    setError('');
    let plan;
    try { plan = planRender(useEditorStore.getState().keep, true); } catch (e) { setError((e as Error).message); return; }
    const c = new AbortController();
    ctl.current = c;
    setBusy(true); setProgress(0); setStage('Starting…');
    try {
      const blob = await renderVideo({ source, ...plan, signal: c.signal, onProgress: (p, s) => { setProgress(p); setStage(s); } });
      downloadBlob(`${safeName(name)}-captioned.mp4`, blob);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError((e as Error).message || 'Export failed.');
    } finally { setBusy(false); ctl.current = null; }
  }

  return (
    <section className="ed-captions" aria-labelledby="cap-h">
      <div className="ed-cuts-head"><h2 id="cap-h">Captions</h2><button type="button" className="btn ghost sm" onClick={reset}>Reset style</button></div>
      <label className="switch cap-main"><input type="checkbox" checked={style.enabled} onChange={(e) => patch({ enabled: e.target.checked })} /><span>Show captions on the preview and in the export</span></label>
      {estimated && <p className="muted cl-approx">Word times are estimated (browser transcription), so the word highlight can drift a little. Server transcription gives exact timing.</p>}

      <div className={`cap-grid${style.enabled ? '' : ' is-off'}`}>
        <label>Font
          <select value={style.font} onChange={(e) => patch({ font: e.target.value as FontId })}>
            {(Object.keys(FONTS) as FontId[]).map((f) => <option key={f} value={f}>{FONTS[f].label}</option>)}
          </select>
        </label>
        <label>Size <output>{style.sizePct.toFixed(1)}%</output>
          <input type="range" min={3} max={10} step={0.5} value={style.sizePct} onChange={(e) => patch({ sizePct: Number(e.target.value) })} />
        </label>
        <label>Words per line <output>{style.maxWords}</output>
          <input type="range" min={1} max={8} step={1} value={style.maxWords} onChange={(e) => patch({ maxWords: Number(e.target.value) })} />
        </label>
        <div className="cap-colors">
          <label>Text<input type="color" value={style.color} onChange={(e) => patch({ color: e.target.value })} /></label>
          <label>Highlight<input type="color" value={style.highlight} onChange={(e) => patch({ highlight: e.target.value })} /></label>
          <label>Background<input type="color" value={style.bg} onChange={(e) => patch({ bg: e.target.value })} /></label>
        </div>
        <label>Background opacity <output>{Math.round(style.bgOpacity * 100)}%</output>
          <input type="range" min={0} max={1} step={0.05} value={style.bgOpacity} onChange={(e) => patch({ bgOpacity: Number(e.target.value) })} />
        </label>
        <div className="aspects" role="radiogroup" aria-label="Caption position">
          {POSITIONS.map((p) => <button key={p.id} type="button" role="radio" aria-checked={style.position === p.id} className={`aspect${style.position === p.id ? ' is-on' : ''}`} onClick={() => patch({ position: p.id })}>{p.label}</button>)}
        </div>
        <label className="switch"><input type="checkbox" checked={style.wordHighlight} onChange={(e) => patch({ wordHighlight: e.target.checked })} /><span>Highlight the spoken word</span></label>
        <label className="switch"><input type="checkbox" checked={style.uppercase} onChange={(e) => patch({ uppercase: e.target.checked })} /><span>UPPERCASE</span></label>
      </div>

      <div className="cap-export">
        {busy ? (
          <>
            <div className="progress slim" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <p className="status"><i className="spin" aria-hidden="true" />{stage} {Math.round(progress * 100)}%</p>
            <button type="button" className="btn ghost sm" onClick={() => ctl.current?.abort()}>Cancel</button>
          </>
        ) : (
          <button type="button" className="btn primary sm" onClick={run} disabled={!style.enabled}>Export video with captions (.mp4)</button>
        )}
        <p className="muted ed-help">Applies your cuts, trim and crop, then burns the captions in. Runs in your browser, so long videos take a while.</p>
        {error && <p className="msg bad" role="alert">{error}</p>}
      </div>
    </section>
  );
}
