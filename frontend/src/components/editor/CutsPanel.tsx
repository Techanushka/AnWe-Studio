import Icon from '../dashboard/Icon.jsx';
import { useEditorStore } from '../../store/editorStore';
import { formatTime } from '../../utils/transcript.js';
import type { Run } from '../../types/editor';

/** "Deleted segments": every run of deleted words, with one-click restore. */
export default function CutsPanel({ onSeek }: { onSeek: (t: number) => void }) {
  const runs = useEditorStore((s) => s.runs);
  const restoreIndices = useEditorStore((s) => s.restoreIndices);
  const restoreAll = useEditorStore((s) => s.restoreAll);
  const range = (r: Run) => Array.from({ length: r.to - r.from + 1 }, (_, k) => r.from + k);

  return (
    <section className="ed-cuts" aria-labelledby="cuts-h">
      <div className="ed-cuts-head">
        <h2 id="cuts-h">Deleted segments <span className="count">{runs.length}</span></h2>
        <button type="button" className="btn ghost sm" onClick={() => restoreAll()} disabled={!runs.length}><Icon name="history" size={15} />Restore all</button>
      </div>
      {runs.length === 0 ? (
        <p className="muted ed-cuts-empty">Nothing deleted yet. Select words in the transcript and press Delete.</p>
      ) : (
        <ul className="ed-cuts-list">
          {runs.map((r) => (
            <li key={r.from}>
              <button type="button" className="cut-main" onClick={() => onSeek(Math.max(0, r.start - 1))} title="Play from just before this cut (preview skips it)">
                <span className="ts">{formatTime(r.start)}</span>
                <span className="cut-text">{r.text}</span>
                <span className="cut-len">{Math.max(0.1, r.end - r.start).toFixed(1)}s</span>
              </button>
              <button type="button" className="btn ghost sm" onClick={() => restoreIndices(range(r))} aria-label={`Restore: ${r.text}`}>Restore</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
