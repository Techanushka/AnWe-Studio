import { create } from 'zustand';
import {
  EMPTY_DOC, MIN_TRIM, buildWords, computeCuts, defaultCrop, deletedRuns, deserializeDoc, findMatches, keepRanges, mergeRanges, sameDoc, serializeDoc, transcriptKey, wordText // [AI] + mergeRanges
} from '../utils/editModel';
import type { CleanupItem, Crop, EditDoc, EditKind, HistoryEntry, Match, Range, Run, SavedHistory, Segment, VideoSize, Word } from '../types/editor'; // [AI] + CleanupItem
import { formatTime } from '../utils/transcript.js';

const span = (a: number, b: number): number[] => {
  const out: number[] = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
  return out;
};
export const MAX_HISTORY = 150;
const COALESCE_MS = 1500;

interface Derived { runs: Run[]; cuts: Range[]; keep: Range[] }
const derive = (words: Word[], doc: EditDoc, duration: number): Derived => {
  const runs = deletedRuns(words, doc.deleted);
  const cuts = computeCuts(runs, doc.trim, duration, doc.gaps); // [AI] + doc.gaps
  return { runs, cuts, keep: keepRanges(cuts, duration) };
};

const startEntry = (doc: EditDoc = EMPTY_DOC, label = 'Original', kind: EditKind = 'start'): HistoryEntry => ({ id: 0, kind, label, at: Date.now(), doc });

const fresh = () => ({
  words: [] as Word[], duration: 0, key: '', videoSize: null as VideoSize | null,
  doc: EMPTY_DOC as EditDoc,
  history: [startEntry()] as HistoryEntry[], index: 0, nextId: 1,
  runs: [] as Run[], cuts: [] as Range[], keep: [] as Range[],
  selected: new Set<number>() as ReadonlySet<number>, anchor: -1, active: -1, playing: false,
  query: '', matches: [] as Match[], matchIndex: -1,
  toast: null as { id: number; text: string } | null
});

export interface LoadArgs {
  segments: Segment[];
  duration?: number;
  /** Feature 3: saved edit state + history. */
  saved?: SavedHistory | null;
  /** Feature 1 projects saved before history existed. */
  legacy?: { deleted: number[]; key: string } | null;
}

export interface EditorState extends ReturnType<typeof fresh> {
  load(args: LoadArgs): void;
  reset(): void;
  setDuration(duration: number): void;
  setVideoSize(size: VideoSize): void;
  setActive(active: number): void;
  setPlaying(playing: boolean): void;
  notify(text: string): void;
  // selection
  selectOnly(i: number): void; extendTo(i: number): void; toggle(i: number): void; selectRange(a: number, b: number): void;
  selectSentence(i: number): void; selectMatches(): void; clearSelection(): void;
  // edits (each one is a history step)
  deleteIndices(list: number[]): number; restoreIndices(list: number[]): number; restoreAll(): number;
  deleteSelected(): number; restoreSelected(): number;
  setCaption(i: number, text: string | null): boolean;
  setTrim(trim: Range | null, opts?: { coalesce?: string }): boolean;
  setCrop(crop: Crop | null, opts?: { coalesce?: string }): boolean;
  /** [AI] Feature 4: apply accepted cleanup suggestions as ONE history step. */
  applyCleanup(items: CleanupItem[], label: string): boolean;
  // history
  undo(): boolean; redo(): boolean; jumpTo(index: number): void;
  // search
  setQuery(query: string): void; stepMatch(dir: number): void;
}

let toastId = 0;
let lastCoalesce: { key: string; at: number; id: number } | null = null;

const snippet = (words: Word[], list: number[]): string => {
  const sorted = [...list].sort((a, b) => a - b);
  const text = sorted.slice(0, 6).map((i) => words[i]?.text ?? '').join(' ');
  return sorted.length > 6 ? `${text} …` : text;
};

/**
 * Editor state.
 *  - `doc` (EditDoc) is the single source of truth for edits; `history` is a list of snapshots of it, with
 *    `index` pointing at the current one. Undo/redo just move `index`. Docs are immutable so snapshots are cheap.
 *  - `runs`, `cuts`, `keep` are derived from words + doc + duration and recomputed in one place.
 */
export const useEditorStore = create<EditorState>()((set, get) => {
  /** Applies a patch to the current doc and records it as one history step. Returns false if nothing changed. */
  const apply = (kind: EditKind, label: string, patch: Partial<EditDoc>, coalesce?: string): boolean => {
    const s = get();
    const next: EditDoc = { ...s.doc, ...patch };
    if (sameDoc(next, s.doc)) return false;
    const now = Date.now();
    const current = s.history[s.index];
    let history: HistoryEntry[];
    let index: number;
    let nextId = s.nextId;
    if (coalesce && lastCoalesce && lastCoalesce.key === coalesce && lastCoalesce.id === current.id && now - lastCoalesce.at < COALESCE_MS && s.index === s.history.length - 1 && s.index > 0) {
      history = s.history.slice();
      history[s.index] = { ...current, kind, label, at: now, doc: next };
      index = s.index;
      lastCoalesce = { key: coalesce, at: now, id: current.id };
    } else {
      const entry: HistoryEntry = { id: nextId++, kind, label, at: now, doc: next };
      history = [...s.history.slice(0, s.index + 1), entry];
      if (history.length > MAX_HISTORY) history = history.slice(history.length - MAX_HISTORY);
      index = history.length - 1;
      lastCoalesce = coalesce ? { key: coalesce, at: now, id: entry.id } : null;
    }
    const d = derive(s.words, next, s.duration);
    const matches = s.query.trim() ? findMatches(s.words, s.query, next.captions) : s.matches;
    set({ doc: next, history, index, nextId, ...d, matches, matchIndex: matches.length ? Math.min(Math.max(0, s.matchIndex), matches.length - 1) : -1 });
    return true;
  };

  const goTo = (index: number) => {
    const s = get();
    const target = s.history[index];
    if (!target) return;
    lastCoalesce = null;
    const matches = s.query.trim() ? findMatches(s.words, s.query, target.doc.captions) : s.matches;
    set({ index, doc: target.doc, ...derive(s.words, target.doc, s.duration), matches, matchIndex: matches.length ? Math.min(Math.max(0, s.matchIndex), matches.length - 1) : -1 });
  };

  return {
    ...fresh(),

    load({ segments, duration = 0, saved = null, legacy = null }) {
      const words = buildWords(segments);
      const key = transcriptKey(words);
      let history: HistoryEntry[] = [startEntry()];
      let index = 0;
      let nextId = 1;
      if (saved && saved.v === 2 && saved.key === key && saved.entries.length) {
        history = saved.entries.map((e) => ({ id: e.id, kind: e.kind, label: e.label, at: e.at, doc: deserializeDoc(e.doc, words.length) }));
        index = Math.min(Math.max(0, saved.index), history.length - 1);
        nextId = Math.max(saved.nextId, ...history.map((h) => h.id + 1));
      } else if (legacy && (!legacy.key || legacy.key === key)) {
        const doc = deserializeDoc({ deleted: legacy.deleted.map((i): [number, number] => [i, i]) }, words.length);
        if (doc.deleted.size) { history = [startEntry(), { id: 1, kind: 'saved', label: `Restored ${doc.deleted.size} saved cut word${doc.deleted.size === 1 ? '' : 's'}`, at: Date.now(), doc }]; index = 1; nextId = 2; }
      }
      lastCoalesce = null;
      const doc = history[index].doc;
      set({ ...fresh(), videoSize: get().videoSize, words, duration, key, doc, history, index, nextId, ...derive(words, doc, duration) }); // the video element may already be loaded, so keep its size
    },
    reset() { lastCoalesce = null; set(fresh()); },
    setDuration(duration) { const s = get(); if (duration !== s.duration) set({ duration, ...derive(s.words, s.doc, duration) }); },
    setVideoSize(size) { const s = get(); if (!s.videoSize || s.videoSize.w !== size.w || s.videoSize.h !== size.h) set({ videoSize: size }); },
    setActive: (active) => set((s) => (s.active === active ? s : { active })),
    setPlaying: (playing) => set((s) => (s.playing === playing ? s : { playing })),
    notify: (text) => set({ toast: { id: ++toastId, text } }),

    // ----- selection -----
    selectOnly: (i) => set({ selected: new Set([i]), anchor: i }),
    extendTo: (i) => set((s) => { const a = s.anchor < 0 ? i : s.anchor; return { selected: new Set(span(a, i)), anchor: a }; }),
    toggle: (i) => set((s) => { const n = new Set(s.selected); if (n.has(i)) n.delete(i); else n.add(i); return { selected: n, anchor: i }; }),
    selectRange: (a, b) => set({ selected: new Set(span(a, b)), anchor: a }),
    selectSentence: (i) => set((s) => {
      const id = s.words[i]?.sentence;
      return { selected: new Set(s.words.filter((w) => w.sentence === id).map((w) => w.i)), anchor: i };
    }),
    selectMatches: () => set((s) => ({ selected: new Set(s.matches.flatMap((m) => span(m.from, m.to))) })),
    clearSelection: () => set({ selected: new Set(), anchor: -1 }),

    // ----- edits: words are only flagged, nothing is ever lost -----
    deleteIndices(list) {
      const s = get();
      const todo = [...new Set(list)].filter((i) => i >= 0 && i < s.words.length && !s.doc.deleted.has(i));
      if (!todo.length) return 0;
      const d = new Set(s.doc.deleted); todo.forEach((i) => d.add(i));
      apply('cut', `Deleted ${todo.length} word${todo.length === 1 ? '' : 's'}: “${snippet(s.words, todo)}”`, { deleted: d });
      return todo.length;
    },
    restoreIndices(list) {
      const s = get();
      const back = [...new Set(list)].filter((i) => s.doc.deleted.has(i));
      if (!back.length) return 0;
      const d = new Set(s.doc.deleted); back.forEach((i) => d.delete(i));
      apply('restore', `Restored ${back.length} word${back.length === 1 ? '' : 's'}: “${snippet(s.words, back)}”`, { deleted: d });
      return back.length;
    },
    restoreAll() {
      const n = get().doc.deleted.size;
      if (!n) return 0;
      apply('restore', `Restored all ${n} deleted words`, { deleted: new Set() });
      return n;
    },
    deleteSelected() {
      const n = get().deleteIndices([...get().selected]);
      if (n) { set({ selected: new Set(), anchor: -1 }); get().notify(`Deleted ${n} word${n === 1 ? '' : 's'}. Ctrl+Z to undo.`); }
      return n;
    },
    restoreSelected() {
      const n = get().restoreIndices([...get().selected]);
      if (n) get().notify(`Restored ${n} word${n === 1 ? '' : 's'}.`);
      return n;
    },
    setCaption(i, text) {
      const s = get();
      const w = s.words[i];
      if (!w) return false;
      const clean = (text ?? '').replace(/\s+/g, ' ').trim();
      const captions: Record<number, string> = { ...s.doc.captions };
      const before = wordText(w, captions);
      if (!clean || clean === w.text) delete captions[i]; else captions[i] = clean;
      const after = wordText(w, captions);
      const reset = !clean || clean === w.text;
      return apply('caption', `${reset ? 'Reset caption' : 'Caption'}: “${before}” → “${after}”`, { captions });
    },
    setTrim(trim, opts) {
      const s = get();
      let next: Range | null = null;
      if (trim && s.duration > 0) {
        const start = Math.max(0, Math.min(trim.start, s.duration - MIN_TRIM));
        const end = Math.min(s.duration, Math.max(trim.end, start + MIN_TRIM));
        next = start <= 0.01 && end >= s.duration - 0.01 ? null : { start, end };
      }
      const label = !next ? 'Reset trim'
        : !s.doc.trim ? (next.start > 0.01 && next.end < s.duration - 0.01 ? `Trimmed to ${formatTime(next.start)}–${formatTime(next.end)}` : next.start > 0.01 ? `Trimmed start to ${formatTime(next.start)}` : `Trimmed end to ${formatTime(next.end)}`)
        : Math.abs(next.start - s.doc.trim.start) > Math.abs(next.end - s.doc.trim.end) ? `Trimmed start to ${formatTime(next.start)}` : `Trimmed end to ${formatTime(next.end)}`;
      return apply('trim', label, { trim: next }, opts?.coalesce);
    },
    setCrop(crop, opts) {
      const s = get();
      const label = !crop ? 'Removed crop'
        : !s.doc.crop || s.doc.crop.aspect !== crop.aspect ? `Cropped to ${crop.aspect}`
          : 'Adjusted crop';
      return apply('crop', label, { crop }, opts?.coalesce);
    },
    // [AI] Feature 4. Uses kind 'cut' so HistoryPanel needs no change.
    applyCleanup(items, label) {
      const s = get();
      const deleted = new Set(s.doc.deleted);
      const gaps: Range[] = [...s.doc.gaps];
      for (const it of items) {
        for (const i of it.words) if (i >= 0 && i < s.words.length) deleted.add(i);
        if (it.gap) gaps.push({ start: it.gap.start, end: it.gap.end });
      }
      const ok = apply('cut', label, { deleted, gaps: mergeRanges(gaps, s.duration) });
      if (ok) get().notify(`${label}. Ctrl+Z to undo.`);
      return ok;
    },

    // ----- history -----
    undo() {
      const { index, history } = get();
      if (index <= 0) return false;
      goTo(index - 1);
      get().notify(`Undid: ${history[index].label}`);
      return true;
    },
    redo() {
      const { index, history } = get();
      if (index >= history.length - 1) return false;
      goTo(index + 1);
      get().notify(`Redid: ${history[index + 1].label}`);
      return true;
    },
    jumpTo(index) { if (index !== get().index) goTo(index); },

    // ----- search -----
    setQuery(query) {
      const s = get();
      const matches = findMatches(s.words, query, s.doc.captions);
      set({ query, matches, matchIndex: matches.length ? 0 : -1 });
    },
    stepMatch(dir) {
      const { matches, matchIndex } = get();
      if (matches.length) set({ matchIndex: (matchIndex + dir + matches.length) % matches.length });
    }
  };
});

export { defaultCrop, serializeDoc };

/** The history in its saved (JSON) form. */
export function snapshotHistory(s: Pick<EditorState, 'key' | 'history' | 'index' | 'nextId'>): SavedHistory {
  return {
    v: 2, key: s.key, index: s.index, nextId: s.nextId,
    entries: s.history.map((h) => ({ id: h.id, kind: h.kind, label: h.label, at: h.at, doc: serializeDoc(h.doc) }))
  };
}
