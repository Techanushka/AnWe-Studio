/**
 * Pure logic for the editor (no React, no DOM). The transcript is a list of WORDS with source times.
 * Editing never touches the video file. Every edit lives in an immutable EditDoc:
 *   deleted words -> cut ranges, trim -> two more cut ranges, captions -> text overrides, crop -> frame rectangle.
 * The player skips the cut ranges; exports describe them for a renderer.
 */
import type { AspectId, Crop, CropRect, EditDoc, Line, Match, Range, Run, SerializedDoc, Segment, VideoSize, Word } from '../types/editor';

export const norm = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{M}\p{N}']/gu, '');
const TERMINAL = /[.!?…।]["'”’)\]]*$/;
const LETTERS = /[^\p{L}\p{M}\p{N}]/gu;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const MIN_TRIM = 0.2; // seconds of video that must remain between the trim handles

// [AI] added `gaps: []`
export const EMPTY_DOC: EditDoc = Object.freeze({ deleted: new Set<number>(), captions: {}, trim: null, crop: null, gaps: [] });

// ---------------------------------------------------------------------------------------------- words
interface TimedText { text: string; start: number; end: number; estimated?: boolean }

/** Word timings from the server (faster-whisper) are exact; use them when they look sane. */
function exactWords(seg: Segment): TimedText[] | null {
  const list = seg.words;
  if (!Array.isArray(list) || !list.length) return null;
  const out: TimedText[] = [];
  let prev = -Infinity;
  for (const w of list) {
    const text = String(w.word ?? w.text ?? '').trim();
    if (!text) continue;
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end < w.start || w.start < prev - 0.05) return null;
    out.push({ text, start: w.start, end: Math.max(w.end, w.start + 0.02) });
    prev = w.start;
  }
  return out.length ? out : null;
}

/** Browser Whisper only gives line timings, so word times are spread over the line by word length. */
function estimatedWords(seg: Segment): TimedText[] {
  const tokens = String(seg.text || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const weights = tokens.map((t) => Math.max(1, [...t.replace(LETTERS, '')].length) + (/[,;:]$/.test(t) ? 1.5 : 0) + (TERMINAL.test(t) ? 3 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = Math.max(0.05 * tokens.length, seg.end - seg.start);
  let cursor = seg.start;
  return tokens.map((text, i) => {
    const d = (span * weights[i]) / total;
    const w = { text, start: cursor, end: cursor + d, estimated: true };
    cursor += d;
    return w;
  });
}

export function buildWords(segments: Segment[]): Word[] {
  const words: Word[] = [];
  let sentence = -1;
  segments.forEach((seg, line) => {
    let fresh = true; // every line starts a new sentence
    for (const w of exactWords(seg) || estimatedWords(seg)) {
      if (fresh) { sentence += 1; fresh = false; }
      words.push({ i: words.length, text: w.text, start: w.start, end: w.end, line, sentence, estimated: Boolean(w.estimated) });
      if (TERMINAL.test(w.text)) fresh = true;
    }
  });
  return words;
}

export function groupLines(words: Word[]): Line[] {
  const lines: Line[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && last.line === w.line) last.to = w.i;
    else lines.push({ line: w.line, from: w.i, to: w.i, start: w.start });
  }
  return lines;
}

/** Fingerprint so saved edits are ignored if the transcript is regenerated. */
export const transcriptKey = (words: Word[]): string =>
  `${words.length}:${words[0]?.text ?? ''}:${words[words.length - 1]?.text ?? ''}:${Math.round((words[words.length - 1]?.end ?? 0) * 10)}`;

/** The text shown/exported for a word: the caption edit if there is one, otherwise the transcript word. */
export const wordText = (w: Word, captions: Readonly<Record<number, string>>): string => captions[w.i] ?? w.text;

// ---------------------------------------------------------------------------------------------- cuts
/** Contiguous runs of deleted words (what the "Deleted segments" list shows). */
export function deletedRuns(words: Word[], deleted: ReadonlySet<number>): Run[] {
  const runs: Run[] = [];
  let from = -1;
  for (let i = 0; i <= words.length; i++) {
    const del = i < words.length && deleted.has(i);
    if (del && from < 0) from = i;
    if (!del && from >= 0) {
      runs.push({ from, to: i - 1, start: words[from].start, end: words[i - 1].end, count: i - from, text: words.slice(from, i).map((w) => w.text).join(' ') });
      from = -1;
    }
  }
  return runs;
}

/** Sort, clamp to the video and merge touching ranges. */
export function mergeRanges(ranges: Range[], duration: number): Range[] {
  const sorted = ranges
    .map((r) => ({ start: Math.max(0, r.start), end: duration > 0 ? Math.min(duration, r.end) : r.end }))
    .filter((r) => r.end - r.start > 0.01)
    .sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.02) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}
/** Time ranges removed from the source video (sorted, merged, clamped to the duration). */
export const cutRanges = (runs: Range[], duration: number): Range[] => mergeRanges(runs, duration);

/** The parts outside the trim handles, as cut ranges. */
export function trimRanges(trim: Range | null, duration: number): Range[] {
  if (!trim) return [];
  const out: Range[] = [];
  if (trim.start > 0.01) out.push({ start: 0, end: trim.start });
  if (duration > 0 && trim.end < duration - 0.01) out.push({ start: trim.end, end: duration });
  return out;
}
/** Deleted words + trim (+ [AI] cleanup pauses) = everything the edited video leaves out. */
export const computeCuts = (runs: Range[], trim: Range | null, duration: number, gaps: ReadonlyArray<Range> = []): Range[] =>
  mergeRanges([...runs, ...gaps, ...trimRanges(trim, duration)], duration);

export function keepRanges(cuts: Range[], duration: number): Range[] {
  const out: Range[] = [];
  let cursor = 0;
  for (const c of cuts) {
    if (c.start - cursor > 0.01) out.push({ start: cursor, end: c.start });
    cursor = c.end;
  }
  if (duration - cursor > 0.01) out.push({ start: cursor, end: duration });
  return out;
}

export const totalLength = (ranges: Range[]): number => ranges.reduce((s, r) => s + (r.end - r.start), 0);
export const cutTotal = totalLength;

/** The cut containing source time t, or null. `cuts` must be sorted. */
export function findCut(cuts: Range[], t: number): Range | null {
  for (const c of cuts) {
    if (t < c.start) return null;
    if (t < c.end) return c;
  }
  return null;
}
/** The first cut that overlaps [a, b] (used by the player to look one frame ahead). */
export function findCutIn(cuts: Range[], a: number, b: number): Range | null {
  for (const c of cuts) {
    if (c.start >= b) return null;
    if (c.end > a) return c;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- time mapping
/** Source time -> time in the edited video. A time inside a cut maps to the cut point. */
export function sourceToEdited(t: number, cuts: Range[]): number {
  let removed = 0;
  for (const c of cuts) {
    if (t >= c.end) removed += c.end - c.start;
    else if (t > c.start) return c.start - removed;
    else break;
  }
  return t - removed;
}
/** Edited time -> source time (inverse of sourceToEdited, using the kept ranges). */
export function editedToSource(te: number, keep: Range[]): number {
  if (!keep.length) return 0;
  let acc = 0;
  for (const k of keep) {
    const len = k.end - k.start;
    if (te < acc + len) return k.start + Math.max(0, te - acc);
    acc += len;
  }
  return keep[keep.length - 1].end;
}

/** Index of the word being spoken at source time t (last word that has started), or -1. */
export function wordAtTime(words: Word[], t: number): number {
  let lo = 0, hi = words.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// ---------------------------------------------------------------------------------------------- search
/** Search: every word must match exactly except the last, which matches as a prefix (single word = contains). */
export function findMatches(words: Word[], query: string, captions: Readonly<Record<number, string>> = {}): Match[] {
  const tokens = query.trim().split(/\s+/).map(norm).filter(Boolean);
  if (!tokens.length) return [];
  const nw = words.map((w) => norm(wordText(w, captions)));
  const k = tokens.length;
  const out: Match[] = [];
  for (let i = 0; i + k <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < k && ok; j++) {
      const w = nw[i + j], t = tokens[j];
      ok = k === 1 ? w.includes(t) : j === k - 1 ? w.startsWith(t) : w === t;
    }
    if (ok) out.push({ from: i, to: i + k - 1 });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- crop
export const ASPECTS: ReadonlyArray<{ id: AspectId; label: string; ratio: number }> = [
  { id: '16:9', label: '16:9 Landscape', ratio: 16 / 9 },
  { id: '9:16', label: '9:16 Vertical', ratio: 9 / 16 },
  { id: '1:1', label: '1:1 Square', ratio: 1 },
  { id: '4:5', label: '4:5 Portrait', ratio: 4 / 5 },
  { id: '4:3', label: '4:3 Classic', ratio: 4 / 3 }
];
export const MAX_ZOOM = 3;
export const defaultCrop = (aspect: AspectId): Crop => ({ aspect, zoom: 1, panX: 0.5, panY: 0.5 });
export const sameCrop = (a: Crop | null, b: Crop | null): boolean =>
  a === b || Boolean(a && b && a.aspect === b.aspect && Math.abs(a.zoom - b.zoom) < 1e-6 && Math.abs(a.panX - b.panX) < 1e-6 && Math.abs(a.panY - b.panY) < 1e-6);

/** The largest rectangle of the source with the chosen aspect ratio, shrunk by zoom and moved by pan. */
export function cropRect(crop: Crop, size: VideoSize): CropRect {
  const target = ASPECTS.find((a) => a.id === crop.aspect)?.ratio ?? size.w / size.h;
  const src = size.w / size.h;
  let w = 1, h = 1;
  if (target > src) h = src / target; else w = target / src;
  const zoom = clamp(crop.zoom, 1, MAX_ZOOM);
  w /= zoom; h /= zoom;
  return { x: (1 - w) * clamp(crop.panX, 0, 1), y: (1 - h) * clamp(crop.panY, 0, 1), w, h };
}

// ---------------------------------------------------------------------------------------------- documents
export function sameDoc(a: EditDoc, b: EditDoc): boolean {
  if (a === b) return true;
  if (a.deleted.size !== b.deleted.size) return false;
  for (const i of a.deleted) if (!b.deleted.has(i)) return false;
  const ka = Object.keys(a.captions), kb = Object.keys(b.captions);
  if (ka.length !== kb.length || ka.some((k) => a.captions[Number(k)] !== b.captions[Number(k)])) return false;
  const t = (x: Range | null) => (x ? `${x.start.toFixed(3)}-${x.end.toFixed(3)}` : '');
  // [AI] cleanup pauses count as a change (otherwise a pauses-only cleanup would be ignored)
  const g = (x: ReadonlyArray<Range> | undefined) => (x ?? []).map((r) => `${r.start.toFixed(3)}-${r.end.toFixed(3)}`).join(',');
  if (g(a.gaps) !== g(b.gaps)) return false;
  return t(a.trim) === t(b.trim) && sameCrop(a.crop, b.crop);
}

export function deletedToRanges(deleted: ReadonlySet<number>): Array<[number, number]> {
  const sorted = [...deleted].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i === last[1] + 1) last[1] = i; else out.push([i, i]);
  }
  return out;
}

export const serializeDoc = (doc: EditDoc): SerializedDoc => ({
  deleted: deletedToRanges(doc.deleted),
  captions: Object.fromEntries(Object.entries(doc.captions)),
  trim: doc.trim ? { ...doc.trim } : null,
  crop: doc.crop ? { ...doc.crop } : null,
  gaps: (doc.gaps ?? []).map((r) => ({ ...r })) // [AI]
});

/** Rebuilds a document from saved JSON, dropping anything that doesn't fit the current transcript. */
export function deserializeDoc(s: Partial<SerializedDoc> | null | undefined, wordCount: number): EditDoc {
  const deleted = new Set<number>();
  for (const r of s?.deleted ?? []) {
    if (!Array.isArray(r)) continue;
    for (let i = Math.max(0, r[0]); i <= Math.min(wordCount - 1, r[1]); i++) deleted.add(i);
  }
  const captions: Record<number, string> = {};
  for (const [k, v] of Object.entries(s?.captions ?? {})) {
    const i = Number(k);
    if (Number.isInteger(i) && i >= 0 && i < wordCount && typeof v === 'string' && v.trim()) captions[i] = v;
  }
  const t = s?.trim;
  const trim = t && Number.isFinite(t.start) && Number.isFinite(t.end) && t.end > t.start ? { start: t.start, end: t.end } : null;
  const c = s?.crop;
  const crop = c && ASPECTS.some((a) => a.id === c.aspect) && Number.isFinite(c.zoom) ? { aspect: c.aspect, zoom: c.zoom, panX: c.panX ?? 0.5, panY: c.panY ?? 0.5 } : null;
  // [AI] cleanup pauses (missing in projects saved before Feature 4 -> empty list)
  const gaps: Range[] = [];
  for (const r of s?.gaps ?? []) if (r && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start) gaps.push({ start: r.start, end: r.end });
  return { deleted, captions, trim, crop, gaps };
}

// ---------------------------------------------------------------------------------------------- exports
const outsideTrim = (w: Word, trim: Range | null) => Boolean(trim && (w.end <= trim.start + 1e-6 || w.start >= trim.end - 1e-6));

/** The transcript after edits, re-timed to the edited video (for .txt / .srt export). */
export function editedSegments(words: Word[], doc: EditDoc, cuts: Range[]): Segment[] {
  const byLine = new Map<number, Word[]>();
  for (const w of words) {
    if (doc.deleted.has(w.i) || outsideTrim(w, doc.trim)) continue;
    const list = byLine.get(w.line);
    if (list) list.push(w); else byLine.set(w.line, [w]);
  }
  return [...byLine.values()].map((ws) => ({
    start: sourceToEdited(ws[0].start, cuts),
    end: sourceToEdited(ws[ws.length - 1].end, cuts),
    text: ws.map((w) => wordText(w, doc.captions)).join(' ')
  }));
}

/** Edit decision list: what a renderer (e.g. FFmpeg) needs to produce the edited video. */
export function buildEditList(args: { projectId: string; words: Word[]; doc: EditDoc; duration: number; videoSize?: VideoSize | null }) {
  const { projectId, words, doc, duration, videoSize } = args;
  const cuts = computeCuts(deletedRuns(words, doc.deleted), doc.trim, duration, doc.gaps); // [AI] gaps
  const keep = keepRanges(cuts, duration);
  const captions = Object.entries(doc.captions).map(([k, text]) => {
    const w = words[Number(k)];
    return { word: Number(k), original: w?.text ?? '', text, start: w?.start ?? 0, end: w?.end ?? 0 };
  }).sort((a, b) => a.word - b.word);
  return {
    version: 2,
    projectId,
    sourceDuration: duration,
    editedDuration: Math.max(0, duration - totalLength(cuts)),
    cuts,
    keep,
    trim: doc.trim,
    captions,
    crop: doc.crop ? { ...doc.crop, rect: videoSize ? cropRect(doc.crop, videoSize) : null, outputPixels: videoSize ? cropPixels(doc.crop, videoSize) : null } : null,
    wordTimingEstimated: words.some((w) => w.estimated),
    createdAt: new Date().toISOString()
  };
}
export function cropPixels(crop: Crop, size: VideoSize): { width: number; height: number } {
  const r = cropRect(crop, size);
  return { width: Math.round((r.w * size.w) / 2) * 2, height: Math.round((r.h * size.h) / 2) * 2 };
}
