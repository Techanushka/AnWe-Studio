import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import Icon from '../dashboard/Icon.jsx';
import { useEditorStore } from '../../store/editorStore';
import { groupLines, wordText } from '../../utils/editModel';
import { formatTime } from '../../utils/transcript.js';
import type { Word as WordT } from '../../types/editor';

interface WordProps {
  w: WordT; text: string; edited: boolean; selected: boolean; deleted: boolean; trimmed: boolean; active: boolean; match: boolean; current: boolean; focusable: boolean;
  onDown: (e: ReactMouseEvent<HTMLButtonElement>, i: number) => void; onEnter: (i: number) => void; onDouble: (i: number) => void;
  onKey: (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => void;
}

const Word = memo(function Word({ w, text, edited, selected, deleted, trimmed, active, match, current, focusable, onDown, onEnter, onDouble, onKey }: WordProps) {
  const cls = `w${selected ? ' is-sel' : ''}${deleted ? ' is-del' : ''}${trimmed ? ' is-trim' : ''}${edited ? ' is-edited' : ''}${active ? ' is-active' : ''}${match ? ' is-match' : ''}${current ? ' is-cur' : ''}`;
  return (
    <button type="button" className={cls} data-wi={w.i} tabIndex={focusable ? 0 : -1} aria-pressed={selected}
      aria-label={deleted ? `${text} (deleted)` : trimmed ? `${text} (trimmed)` : undefined} title={edited ? `Original: ${w.text}` : undefined}
      onMouseDown={(e) => onDown(e, w.i)} onMouseEnter={() => onEnter(w.i)} onDoubleClick={() => onDouble(w.i)} onKeyDown={(e) => onKey(e, w.i)}>
      {text}
    </button>
  );
});

export default function TranscriptPanel({ onSeek }: { onSeek: (t: number) => void }) {
  const words = useEditorStore((s) => s.words);
  const deleted = useEditorStore((s) => s.doc.deleted);
  const captions = useEditorStore((s) => s.doc.captions);
  const trim = useEditorStore((s) => s.doc.trim);
  const selected = useEditorStore((s) => s.selected);
  const active = useEditorStore((s) => s.active);
  const playing = useEditorStore((s) => s.playing);
  const query = useEditorStore((s) => s.query);
  const matches = useEditorStore((s) => s.matches);
  const matchIndex = useEditorStore((s) => s.matchIndex);
  const store = useEditorStore.getState;

  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ on: false, moved: false, anchor: -1 });
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;
  const [focusIndex, setFocusIndex] = useState(0);
  const [follow, setFollow] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const lines = useMemo(() => groupLines(words), [words]);
  const matchSet = useMemo(() => { const s = new Set<number>(); matches.forEach((m) => { for (let i = m.from; i <= m.to; i++) s.add(i); }); return s; }, [matches]);
  const trimmedSet = useMemo(() => {
    const s = new Set<number>();
    if (trim) words.forEach((w) => { if (w.end <= trim.start + 1e-6 || w.start >= trim.end - 1e-6) s.add(w.i); });
    return s;
  }, [words, trim]);
  const cur = matches[matchIndex];
  const estimated = useMemo(() => words.some((w) => w.estimated), [words]);

  const stats = useMemo(() => {
    let del = 0, secs = 0;
    selected.forEach((i) => { if (deleted.has(i)) del += 1; secs += words[i] ? words[i].end - words[i].start : 0; });
    return { count: selected.size, deletedCount: del, liveCount: selected.size - del, secs };
  }, [selected, deleted, words]);

  const el = (i: number) => rootRef.current?.querySelector<HTMLElement>(`[data-wi="${i}"]`) ?? null;

  const startEdit = useCallback((i: number) => {
    const st = store();
    const w = st.words[i];
    if (!w) return;
    st.selectOnly(i);
    setDraft(wordText(w, st.doc.captions));
    setEditing(i);
  }, [store]);
  const finishEdit = (save: boolean) => {
    if (editing === null) return;
    const i = editing;
    setEditing(null);
    if (save) store().setCaption(i, draft);
    requestAnimationFrame(() => el(i)?.focus({ preventScroll: true }));
  };

  // Drag-to-select; a plain click (no drag) also jumps the video to that word.
  const onDown = useCallback((e: ReactMouseEvent<HTMLButtonElement>, i: number) => {
    if (e.button !== 0) return;
    const st = store();
    setFocusIndex(i);
    if (e.shiftKey) { e.preventDefault(); st.extendTo(i); return; }
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); st.toggle(i); return; }
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    dragRef.current = { on: true, moved: false, anchor: i };
    st.selectOnly(i);
  }, [store]);
  const onEnter = useCallback((i: number) => {
    const d = dragRef.current;
    if (!d.on) return;
    if (i !== d.anchor) d.moved = true;
    store().selectRange(d.anchor, i);
  }, [store]);
  useEffect(() => {
    const up = () => {
      const d = dragRef.current;
      if (!d.on) return;
      d.on = false;
      const w = store().words[d.anchor];
      if (!d.moved && w) seekRef.current(w.start);
    };
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, [store]);

  const onDouble = useCallback((i: number) => store().selectSentence(i), [store]);
  const onKey = useCallback((e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    const st = store();
    const last = st.words.length - 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const n = Math.min(last, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)));
      if (e.shiftKey) { if (st.anchor < 0) st.selectOnly(i); store().extendTo(n); }
      setFocusIndex(n);
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-wi="${n}"]`)?.focus());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.shiftKey) st.extendTo(i); else st.selectOnly(i);
      seekRef.current(st.words[i].start);
    } else if (e.key === 'F2') {
      e.preventDefault();
      startEdit(i);
    }
  }, [store, startEdit]);

  // Delete / Backspace deletes the selection, Esc clears it (not while typing in a text box).
  const onPanelKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); store().deleteSelected(); }
    else if (e.key === 'Escape') store().clearSelection();
  };

  const toggleLine = (l: { from: number; to: number }) => {
    const st = store();
    const idx = Array.from({ length: l.to - l.from + 1 }, (_, k) => l.from + k);
    if (idx.every((i) => st.doc.deleted.has(i))) st.restoreIndices(idx); else st.deleteIndices(idx);
  };
  const step = (dir: number) => {
    store().stepMatch(dir);
    const s = store();
    const m = s.matches[s.matchIndex];
    if (m) seekRef.current(s.words[m.from].start);
  };

  useEffect(() => { if (cur) el(cur.from)?.scrollIntoView({ block: 'center' }); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (follow && playing && active >= 0) el(active)?.scrollIntoView({ block: 'nearest' }); }, [active, follow, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const single = stats.count === 1 ? [...selected][0] : null;
  const editedAny = single !== null && captions[single] !== undefined;

  return (
    <section className="ed-left card" aria-label="Transcript" onKeyDown={onPanelKey}>
      <div className="ed-search">
        <div className="search">
          <Icon name="search" size={17} />
          <input type="search" value={query} placeholder="Search the transcript" aria-label="Search the transcript"
            onChange={(e) => store().setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') store().setQuery(''); }} />
        </div>
        {query.trim() && (
          <div className="ed-search-tools" role="group" aria-label="Search results">
            <span className="muted" aria-live="polite">{matches.length ? `${matchIndex + 1} of ${matches.length}` : 'No matches'}</span>
            <button type="button" className="icon-btn" onClick={() => step(-1)} disabled={!matches.length} aria-label="Previous match"><Icon name="chevronUp" size={17} /></button>
            <button type="button" className="icon-btn" onClick={() => step(1)} disabled={!matches.length} aria-label="Next match"><Icon name="chevronDown" size={17} /></button>
            <button type="button" className="btn ghost sm" onClick={() => store().selectMatches()} disabled={!matches.length}>Select all matches</button>
          </div>
        )}
        <label className="switch sm"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /><span>Follow playback</span></label>
      </div>

      {estimated && (
        <p className="ed-note" role="note"><Icon name="alert" size={15} /><span>Word timing is estimated from each line (browser transcription), so a cut can be off by a fraction of a second. Connect the transcription server for exact word timing.</span></p>
      )}
      <p className="ed-help muted">Click a word to jump to it. Drag, or Shift+click, to select. Double-click selects a sentence. Delete removes the selection. F2 edits a word’s caption text. Ctrl+Z undoes.</p>

      <div className="ed-scroll" ref={rootRef}>
        {lines.map((l) => {
          let allDeleted = true;
          for (let i = l.from; i <= l.to; i++) if (!deleted.has(i)) { allDeleted = false; break; }
          return (
            <div className="line" key={l.line}>
              <div className="line-meta">
                <button type="button" className="ts" onClick={() => onSeek(l.start)} title="Jump to this line">{formatTime(l.start)}</button>
                <button type="button" className="icon-btn sm" onClick={() => toggleLine(l)} aria-label={allDeleted ? 'Restore this line' : 'Delete this line'} title={allDeleted ? 'Restore this line' : 'Delete this line'}>
                  <Icon name={allDeleted ? 'history' : 'trash'} size={15} />
                </button>
              </div>
              <p className="line-text">
                {words.slice(l.from, l.to + 1).map((w, k) => (
                  <Fragment key={w.i}>
                    {k > 0 && ' '}
                    <Word w={w} text={wordText(w, captions)} edited={captions[w.i] !== undefined} selected={selected.has(w.i)} deleted={deleted.has(w.i)} trimmed={trimmedSet.has(w.i)}
                      active={active === w.i} match={matchSet.has(w.i)} current={Boolean(cur) && w.i >= cur.from && w.i <= cur.to} focusable={w.i === focusIndex}
                      onDown={onDown} onEnter={onEnter} onDouble={onDouble} onKey={onKey} />
                  </Fragment>
                ))}
              </p>
            </div>
          );
        })}
      </div>

      {editing !== null ? (
        <form className="ed-sel ed-caption" onSubmit={(e) => { e.preventDefault(); finishEdit(true); }}>
          <label htmlFor="ed-caption-input" className="ed-sel-info">Caption text</label>
          <input id="ed-caption-input" type="text" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(false); } }} />
          <div className="ed-sel-actions">
            <button type="submit" className="btn primary sm">Save</button>
            <button type="button" className="btn ghost sm" onClick={() => finishEdit(false)}>Cancel</button>
          </div>
        </form>
      ) : stats.count > 0 && (
        <div className="ed-sel" role="toolbar" aria-label="Selection actions">
          <span className="ed-sel-info">{stats.count} word{stats.count > 1 ? 's' : ''} selected, {stats.secs.toFixed(1)}s</span>
          <div className="ed-sel-actions">
            {stats.liveCount > 0 && <button type="button" className="btn danger sm" onClick={() => store().deleteSelected()}><Icon name="trash" size={15} />Delete</button>}
            {stats.deletedCount > 0 && <button type="button" className="btn primary sm" onClick={() => store().restoreSelected()}><Icon name="history" size={15} />Restore</button>}
            {single !== null && <button type="button" className="btn ghost sm" onClick={() => startEdit(single)}><Icon name="edit" size={15} />{editedAny ? 'Edit caption' : 'Edit text'}</button>}
            {single !== null && editedAny && <button type="button" className="btn ghost sm" onClick={() => store().setCaption(single, null)}>Reset text</button>}
            <button type="button" className="btn ghost sm" onClick={() => store().selectSentence(store().anchor >= 0 ? store().anchor : [...selected][0])}>Select sentence</button>
            <button type="button" className="btn ghost sm" onClick={() => store().clearSelection()}>Clear</button>
          </div>
        </div>
      )}
    </section>
  );
}
