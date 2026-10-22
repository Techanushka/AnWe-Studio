import Icon from '../dashboard/Icon.jsx';
import { useEditorStore } from '../../store/editorStore';
import { formatEdited } from '../../utils/format.js';
import type { EditKind } from '../../types/editor';

const ICON: Record<EditKind, string> = { start: 'film', cut: 'trash', restore: 'history', trim: 'trim', caption: 'edit', crop: 'crop', saved: 'history' };
const KIND: Record<EditKind, string> = { start: 'Start', cut: 'Cut', restore: 'Restore', trim: 'Trim', caption: 'Caption', crop: 'Crop', saved: 'Saved' };

/** Feature 3: every cut, restore, trim, caption change and crop is a step you can undo, redo or jump back to. */
export default function HistoryPanel() {
  const history = useEditorStore((s) => s.history);
  const index = useEditorStore((s) => s.index);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const jumpTo = useEditorStore((s) => s.jumpTo);
  const steps = history.length - 1;

  return (
    <section className="ed-history" aria-labelledby="hist-h">
      <div className="ed-cuts-head">
        <h2 id="hist-h">Edit history <span className="count">{steps}</span></h2>
        <div className="ed-hist-btns">
          <button type="button" className="btn ghost sm" onClick={() => undo()} disabled={index <= 0}><Icon name="undo" size={15} />Undo</button>
          <button type="button" className="btn ghost sm" onClick={() => redo()} disabled={index >= history.length - 1}><Icon name="redo" size={15} />Redo</button>
        </div>
      </div>
      {steps === 0 ? (
        <p className="muted ed-cuts-empty">No edits yet. Cuts, trims, caption changes and crops will be listed here, and you can step back to any of them.</p>
      ) : (
        <ol className="ed-hist-list" reversed start={history.length}>
          {history.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => (
            <li key={h.id}>
              <button type="button" className={`hist${i === index ? ' is-now' : ''}${i > index ? ' is-future' : ''}`} onClick={() => jumpTo(i)}
                aria-current={i === index ? 'step' : undefined} title={i === index ? 'Current state' : i > index ? 'Redo to here' : 'Go back to here'}>
                <span className={`hist-ic ${h.kind}`}><Icon name={ICON[h.kind]} size={15} /></span>
                <span className="hist-text"><b>{KIND[h.kind]}</b> {h.label}</span>
                <span className="hist-time">{i === index ? 'Now' : formatEdited(new Date(h.at).toISOString())}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted ed-hist-hint">Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z or Ctrl+Y redo. Saved in this browser, so your edits and history are still here after a reload.</p>
    </section>
  );
}
