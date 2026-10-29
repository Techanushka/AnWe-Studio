import { useCleanupStore } from '../../store/cleanupStore';
import { MODES, savedSeconds } from '../../utils/cleanup';
import type { CleanupMode } from '../../utils/cleanup';
import { formatTime } from '../../utils/transcript.js';

const KIND = { filler: 'Filler', repeat: 'Repeat', silence: 'Pause' } as const;

/** Feature 4: review filler words and pauses, then accept or reject them one by one or all at once. */
export default function CleanupPanel({ onSeek }: { onSeek: (t: number) => void }) {
  const { mode, fillers, silences, suggestions, analyzed } = useCleanupStore();
  const { setMode, setKind, analyze, accept, acceptAll, reject, rejectAll } = useCleanupStore.getState();
  const saved = savedSeconds(suggestions);
  const approx = suggestions.some((s) => s.approx);

  return (
    <section className="ed-cleanup" aria-labelledby="cl-h">
      <div className="ed-cuts-head">
        <h2 id="cl-h">AI cleanup <span className="count">{suggestions.length}</span></h2>
      </div>
      <p className="muted ed-help">Finds filler words and long pauses. Nothing is cut until you accept it, and every accept can be undone.</p>

      <div className="aspects" role="radiogroup" aria-label="Cleanup mode">
        {(Object.keys(MODES) as CleanupMode[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={`aspect${mode === m ? ' is-on' : ''}`} onClick={() => setMode(m)}>{MODES[m].label}</button>
        ))}
      </div>
      <p className="muted cl-blurb">{MODES[mode].blurb}</p>

      <div className="cl-opts">
        <label className="switch"><input type="checkbox" checked={fillers} onChange={(e) => setKind('fillers', e.target.checked)} /><span>Filler words</span></label>
        <label className="switch"><input type="checkbox" checked={silences} onChange={(e) => setKind('silences', e.target.checked)} /><span>Pauses</span></label>
        <button type="button" className="btn primary sm" onClick={analyze} disabled={!fillers && !silences}>{analyzed ? 'Scan again' : 'Find suggestions'}</button>
      </div>

      {analyzed && suggestions.length === 0 && <p className="muted ed-cuts-empty">Nothing to clean up in this mode. Try a stricter mode for more suggestions.</p>}

      {suggestions.length > 0 && (
        <>
          <div className="cl-summary">
            <span><b>{suggestions.length}</b> suggestion{suggestions.length === 1 ? '' : 's'}, saves about <b>{saved.toFixed(1)}s</b></span>
            <span className="cl-bulk">
              <button type="button" className="btn primary sm" onClick={acceptAll}>Accept all</button>
              <button type="button" className="btn ghost sm" onClick={rejectAll}>Reject all</button>
            </span>
          </div>
          {approx && <p className="muted cl-approx">Some word times are estimated (browser transcription), so a filler cut can clip a neighbouring word. Click a row to preview first.</p>}
          <ul className="ed-cuts-list cl-list">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button type="button" className="cut-main" onClick={() => onSeek(Math.max(0, s.start - 1))} title="Play from one second before this suggestion">
                  <span className="ts">{formatTime(s.start)}</span>
                  <span className={`cl-kind ${s.kind}`}>{KIND[s.kind]}</span>
                  <span className="cl-text">{s.label}</span>
                  <span className="cut-len">{(s.end - s.start).toFixed(1)}s</span>
                </button>
                <button type="button" className="btn primary sm" onClick={() => accept([s.id])} aria-label={`Accept: ${s.label}`} title="Cut this">✓</button>
                <button type="button" className="btn ghost sm" onClick={() => reject(s.id)} aria-label={`Reject: ${s.label}`} title="Keep this">✕</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
