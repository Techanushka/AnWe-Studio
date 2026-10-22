import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../dashboard/Icon.jsx';
import { useEditorStore } from '../../store/editorStore';
import { buildEditList, editedSegments, totalLength } from '../../utils/editModel';
import { downloadText, formatTime, toSrt, toTimestampedText } from '../../utils/transcript.js';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

export default function EditorTopBar({ projectId, name }: { projectId: string; name: string }) {
  const hasWords = useEditorStore((s) => s.words.length > 0);
  const cuts = useEditorStore((s) => s.cuts);
  const duration = useEditorStore((s) => s.duration);
  const index = useEditorStore((s) => s.index);
  const steps = useEditorStore((s) => s.history.length);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const nextLabel = useEditorStore((s) => s.history[s.index + 1]?.label);
  const prevLabel = useEditorStore((s) => s.history[s.index]?.label);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const base = (name || 'project').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'project';

  function exportAs(kind: 'txt' | 'srt' | 'json') {
    setOpen(false);
    const s = useEditorStore.getState();
    if (kind === 'json') {
      downloadText(`${base}-edit-list.json`, JSON.stringify(buildEditList({ projectId, words: s.words, doc: s.doc, duration: s.duration, videoSize: s.videoSize }), null, 2), 'application/json');
      return;
    }
    const edited = editedSegments(s.words, s.doc, s.cuts);
    if (kind === 'txt') downloadText(`${base}-edited-transcript.txt`, toTimestampedText(edited));
    else downloadText(`${base}-edited.srt`, toSrt(edited), 'application/x-subrip');
  }

  return (
    <header className="ed-top">
      <Link to="/dashboard" className="ed-back"><Icon name="chevronLeft" size={18} />Dashboard</Link>
      <h1 className="ed-title" title={name}>{name}</h1>
      {hasWords && (
        <div className="ed-chips">
          <span className="chip">{cuts.length} cut{cuts.length === 1 ? '' : 's'}</span>
          <span className="chip">{formatTime(Math.max(0, duration - totalLength(cuts)))} edited</span>
        </div>
      )}
      {hasWords && (
        <div className="ed-undo" role="group" aria-label="Undo and redo">
          <button type="button" className="icon-btn" onClick={() => undo()} disabled={index <= 0} aria-label="Undo" title={index > 0 ? `Undo: ${prevLabel} (${MOD}Z)` : `Nothing to undo (${MOD}Z)`}><Icon name="undo" size={19} /></button>
          <button type="button" className="icon-btn" onClick={() => redo()} disabled={index >= steps - 1} aria-label="Redo" title={index < steps - 1 ? `Redo: ${nextLabel} (${MOD}${isMac ? '⇧Z' : 'Y'})` : `Nothing to redo (${MOD}${isMac ? '⇧Z' : 'Y'})`}><Icon name="redo" size={19} /></button>
        </div>
      )}
      <div className="menu-wrap" ref={ref}>
        <button type="button" className="btn primary sm" onClick={() => setOpen(!open)} disabled={!hasWords} aria-haspopup="menu" aria-expanded={open}>
          <Icon name="download" size={16} />Export
        </button>
        {open && (
          <div className="pop right ed-export" role="menu">
            <button type="button" role="menuitem" onClick={() => exportAs('txt')}>Edited transcript (.txt)</button>
            <button type="button" role="menuitem" onClick={() => exportAs('srt')}>Edited captions (.srt)</button>
            <button type="button" role="menuitem" onClick={() => exportAs('json')}>Edit list (.json)</button>
            <p className="ed-export-note">Rendering a new video file isn’t included yet. The edit list holds the exact cuts, trim, captions and crop for a renderer (e.g. FFmpeg).</p>
          </div>
        )}
      </div>
    </header>
  );
}
