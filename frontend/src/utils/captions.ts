/**
 * Feature 5 – caption model shared by the live preview overlay and the FFmpeg export.
 * Captions are built from the SAME words the editor uses, so deleted words, caption text edits, trim and
 * cleanup cuts are respected automatically (a word is shown only if its midpoint is inside a kept range).
 */
import { wordText } from './editModel';
import type { Range, Word } from '../types/editor';

export type FontId = 'noto' | 'poppins';
export type CapPosition = 'top' | 'middle' | 'bottom';

export interface CaptionStyle {
  enabled: boolean;
  font: FontId;
  /** Font size as % of the SHORTER side of the video frame (same rule in preview and export). */
  sizePct: number;
  color: string;
  highlight: string;
  wordHighlight: boolean;
  bg: string;
  bgOpacity: number;
  position: CapPosition;
  maxWords: number;
  uppercase: boolean;
}

export const DEFAULT_STYLE: CaptionStyle = {
  enabled: true, font: 'noto', sizePct: 5.5, color: '#ffffff', highlight: '#ffd84d', wordHighlight: true,
  bg: '#000000', bgOpacity: 0.55, position: 'bottom', maxWords: 4, uppercase: false
};

/** `ass` is the family name inside the font file; `file` lives in frontend/public/fonts/. */
export const FONTS: Record<FontId, { label: string; css: string; ass: string; file: string }> = {
  noto: { label: 'Noto Sans', css: '"Noto Sans","Noto Sans Devanagari",system-ui,sans-serif', ass: 'Noto Sans', file: 'NotoSans-Bold.ttf' },
  poppins: { label: 'Poppins', css: '"Poppins","Noto Sans Devanagari",system-ui,sans-serif', ass: 'Poppins', file: 'Poppins-Bold.ttf' }
};
/** Hindi words are switched to this font automatically, because Latin fonts have no Devanagari glyphs. */
export const DEVA_FONT = { ass: 'Noto Sans Devanagari', file: 'NotoSansDevanagari-Bold.ttf' };
export const hasDevanagari = (t: string): boolean => /[\u0900-\u097F]/.test(t);

export const hexToRgba = (hex: string, a: number): string => {
  const h = hex.replace('#', '').padEnd(6, '0');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
};

export interface CapWord { i: number; text: string; start: number; end: number }
/** `until` = when the line disappears (a little after the last word, never over the next line). */
export interface CapLine { id: number; start: number; end: number; until: number; words: CapWord[] }

const MAX_CHARS = 34;
const MAX_GAP = 0.8;
const SENTENCE_END = /[.!?…।]["'”’)\]]*$/;

/** Groups words into short caption lines. `pieces` = source ranges that survive the edit (sorted). */
export function buildCaptionLines(words: Word[], captions: Readonly<Record<number, string>>, pieces: Range[], maxWords: number): CapLine[] {
  const lines: CapLine[] = [];
  let cur: CapWord[] = [];
  let curPiece = -1;
  let piece = 0;
  let chars = 0;
  const flush = () => {
    if (cur.length) lines.push({ id: lines.length, start: cur[0].start, end: cur[cur.length - 1].end, until: 0, words: cur });
    cur = []; chars = 0;
  };
  for (const w of words) {
    const mid = (w.start + w.end) / 2;
    while (piece < pieces.length && pieces[piece].end <= mid) piece++;
    if (piece >= pieces.length) break;
    if (pieces[piece].start > mid) continue; // the word is inside a cut
    const text = wordText(w, captions);
    const prev = cur[cur.length - 1];
    if (prev && (cur.length >= maxWords || chars + text.length + 1 > MAX_CHARS || piece !== curPiece || SENTENCE_END.test(prev.text) || w.start - prev.end > MAX_GAP)) flush();
    cur.push({ i: w.i, text, start: w.start, end: w.end });
    chars += text.length + 1;
    curPiece = piece;
  }
  flush();
  lines.forEach((l, k) => {
    const next = lines[k + 1];
    l.until = Math.max(l.end, Math.min(l.end + 0.35, next ? next.start : Infinity));
  });
  return lines;
}

/** Index of the line visible at source time t, or -1. */
export function lineAt(lines: CapLine[], t: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (lines[m].start <= t) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans >= 0 && t < lines[ans].until ? ans : -1;
}

/** Index (within the line) of the word being spoken at time t. */
export function activeWord(line: CapLine, t: number): number {
  let a = 0;
  for (let k = 0; k < line.words.length; k++) if (line.words[k].start <= t) a = k;
  return a;
}
