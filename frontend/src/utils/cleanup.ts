/**
 * Feature 4 – AI auto-cleanup detection (pure logic, no React).
 * Finds filler words, stutter repeats and long pauses in the word list and returns REVIEWABLE suggestions.
 * Nothing is cut here; accepting a suggestion goes through editorStore.applyCleanup (one undo step).
 */
import { norm } from './editModel';
import type { Range, Word } from '../types/editor';

export type CleanupMode = 'gentle' | 'balanced' | 'aggressive';
export type SuggestionKind = 'filler' | 'repeat' | 'silence';

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  start: number;
  end: number;
  /** Word indices to delete (fillers / repeats). Empty for silences. */
  words: number[];
  /** Time range to cut (silences only). */
  gap: Range | null;
  label: string;
  /** True when the word timing was estimated (browser transcription), so the cut edges may be off a little. */
  approx: boolean;
}

interface Phrase { tokens: string[]; needsComma?: boolean }
interface ModeConfig { label: string; blurb: string; minSilence: number; leave: number; phrases: Phrase[]; repeats: boolean }

const p = (text: string, needsComma = false): Phrase => ({ tokens: text.split(' ').map(norm), needsComma });

const SOUNDS = 'um umm uhm uh uhh erm er ehm hmm hm mm mmm mhm'.split(' ').map((t) => p(t));
const BALANCED = [...SOUNDS, p('ah'), p('eh'), p('you know'), p('i mean')];
// "like", "actually"… are real words too, so they only count when set off by a comma/pause ("so, like, I went").
const AGGRESSIVE = [
  ...BALANCED, p('kind of'), p('sort of'),
  p('like', true), p('basically', true), p('actually', true), p('literally', true), p('honestly', true),
  p('matlab'), p('मतलब'), p('यानी'), p('yaani')
];

export const MODES: Record<CleanupMode, ModeConfig> = {
  gentle: { label: 'Gentle', blurb: 'Only "um/uh" sounds and pauses over 1.5 s. Leaves a natural 0.6 s pause.', minSilence: 1.5, leave: 0.6, phrases: SOUNDS, repeats: false },
  balanced: { label: 'Balanced', blurb: 'Hesitation sounds, "you know", "I mean" and pauses over 0.8 s. Leaves 0.3 s.', minSilence: 0.8, leave: 0.3, phrases: BALANCED, repeats: false },
  aggressive: { label: 'Aggressive', blurb: 'Everything above plus "like", "basically", "matlab", repeated words and pauses over 0.4 s. Review carefully.', minSilence: 0.4, leave: 0.12, phrases: AGGRESSIVE, repeats: true }
};

const coveredBy = (cuts: Range[], start: number, end: number) => cuts.some((c) => c.start <= start + 0.02 && c.end >= end - 0.02);

export function detectCleanup(
  words: Word[], deleted: ReadonlySet<number>, cuts: Range[], duration: number,
  mode: CleanupMode, want: { fillers: boolean; silences: boolean } = { fillers: true, silences: true }
): Suggestion[] {
  const cfg = MODES[mode];
  const n = words.length;
  const out: Suggestion[] = [];
  if (!n) return out;
  const nt = words.map((w) => norm(w.text));
  const used = new Set<number>();

  if (want.fillers) {
    const phrases = [...cfg.phrases].sort((a, b) => b.tokens.length - a.tokens.length); // longest phrase first
    for (let i = 0; i < n; i++) {
      if (deleted.has(i) || !nt[i]) continue;
      for (const ph of phrases) {
        const len = ph.tokens.length;
        if (i + len > n) continue;
        let ok = true;
        for (let k = 0; k < len && ok; k++) ok = nt[i + k] === ph.tokens[k] && !deleted.has(i + k);
        if (!ok) continue;
        if (ph.needsComma && !/[,.;:—-]$/.test(words[i + len - 1].text) && !(i > 0 && /[,.;:]$/.test(words[i - 1].text))) continue;
        const idx = Array.from({ length: len }, (_, k) => i + k);
        idx.forEach((x) => used.add(x));
        out.push({
          id: `filler-${i}`, kind: 'filler', start: words[i].start, end: words[i + len - 1].end, words: idx, gap: null,
          label: idx.map((x) => words[x].text).join(' ').replace(/[,.;:!?]+$/, ''), approx: idx.some((x) => words[x].estimated)
        });
        i += len - 1;
        break;
      }
    }
    if (cfg.repeats) {
      for (let i = 0; i < n - 1; i++) {
        if (deleted.has(i) || deleted.has(i + 1) || used.has(i) || used.has(i + 1) || !nt[i] || nt[i] !== nt[i + 1]) continue;
        if (words[i + 1].start - words[i].end > 0.6) continue;
        out.push({ id: `repeat-${i}`, kind: 'repeat', start: words[i].start, end: words[i].end, words: [i], gap: null, label: `${words[i].text.replace(/[,.;:!?]+$/, '')} (repeated)`, approx: words[i].estimated });
      }
    }
  }

  if (want.silences) {
    const add = (from: number, to: number, startPad: number, endPad: number) => {
      const start = from + startPad, end = to - endPad;
      if (end - start < 0.15 || coveredBy(cuts, start, end)) return;
      out.push({ id: `silence-${start.toFixed(2)}`, kind: 'silence', start, end, words: [], gap: { start, end }, label: `${(to - from).toFixed(1)}s pause`, approx: false });
    };
    const half = cfg.leave / 2;
    if (!deleted.has(0) && words[0].start >= cfg.minSilence) add(0, words[0].start, 0, half);
    for (let i = 0; i < n - 1; i++) {
      if (deleted.has(i) || deleted.has(i + 1)) continue;
      if (words[i + 1].start - words[i].end >= cfg.minSilence) add(words[i].end, words[i + 1].start, half, half);
    }
    const last = words[n - 1];
    if (!deleted.has(n - 1) && duration - last.end >= cfg.minSilence) add(last.end, duration, half, 0);
  }

  return out.sort((a, b) => a.start - b.start);
}

export const savedSeconds = (list: Suggestion[]): number => list.reduce((s, x) => s + (x.end - x.start), 0);
