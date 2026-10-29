/**
 * Builds an ASS subtitle script (libass) from caption lines. FFmpeg.wasm burns it into the video.
 * ASS can colour one word at a time, so each word gets its own short event with that word highlighted.
 * Times are converted from SOURCE seconds to OUTPUT seconds with `pieces` (the ranges that are kept).
 */
import { DEVA_FONT, FONTS, hasDevanagari } from './captions';
import type { CapLine, CaptionStyle } from './captions';
import type { Range } from '../types/editor';

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
const bgr = (hex: string) => { const h = hex.replace('#', '').padEnd(6, '0'); return `${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };
/** ASS colour with alpha: &HAABBGGRR (alpha 00 = opaque). */
const assColor = (hex: string, opacity = 1) => `&H${hex2((1 - opacity) * 255).toUpperCase()}${bgr(hex)}`;

const clock = (t: number) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
};

/** Source time -> time in the rendered output (pieces are joined back to back). */
export function sourceToOutput(t: number, pieces: Range[]): number {
  let acc = 0;
  for (const p of pieces) {
    if (t < p.start) return acc;
    if (t < p.end) return acc + (t - p.start);
    acc += p.end - p.start;
  }
  return acc;
}

const clean = (s: string) => s.replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim();

export function buildAss(lines: CapLine[], style: CaptionStyle, size: { w: number; h: number }, pieces: Range[]): { ass: string; fonts: string[] } {
  const font = FONTS[style.font];
  const fontSize = Math.round(Math.min(size.w, size.h) * (style.sizePct / 100));
  const boxed = style.bgOpacity > 0.02;
  const outline = boxed ? Math.round(fontSize * 0.28) : Math.max(2, Math.round(fontSize * 0.07));
  const back = assColor(style.bg, style.bgOpacity);
  const outlineColor = boxed ? back : assColor('#000000', 1); // libass uses either colour for the box, so both match
  const align = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2;
  const marginX = Math.round(size.w * 0.06);
  const marginV = Math.round(size.h * 0.07);
  const usesDeva = lines.some((l) => l.words.some((w) => hasDevanagari(w.text)));

  const fn = (txt: string) => (hasDevanagari(txt) ? `\\fn${DEVA_FONT.ass}` : '');
  const render = (txt: string, active: boolean) => {
    const safe = clean(style.uppercase ? txt.toUpperCase() : txt);
    if (active) return `{\\c&H${bgr(style.highlight)}&\\fscx112\\fscy112\\t(0,90,\\fscx100\\fscy100)${fn(txt)}}${safe}{\\r}`;
    const f = fn(txt);
    return f ? `{${f}}${safe}{\\r}` : safe;
  };

  const events: string[] = [];
  const push = (a: number, b: number, text: string) => {
    const s = sourceToOutput(a, pieces), e = sourceToOutput(b, pieces);
    if (e - s >= 0.02) events.push(`Dialogue: 0,${clock(s)},${clock(e)},Default,,0,0,0,,${text}`);
  };
  for (const line of lines) {
    const ws = line.words;
    if (!style.wordHighlight) { push(line.start, line.until, ws.map((w) => render(w.text, false)).join(' ')); continue; }
    ws.forEach((w, k) => {
      const start = k === 0 ? line.start : w.start;
      const end = k === ws.length - 1 ? line.until : ws[k + 1].start;
      push(start, end, ws.map((x, j) => render(x.text, j === k)).join(' '));
    });
  }

  const ass = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${size.w}`, `PlayResY: ${size.h}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font.ass},${fontSize},${assColor(style.color)},&H000000FF,${outlineColor},${back},-1,0,0,0,100,100,0,0,${boxed ? 3 : 1},${outline},0,${align},${marginX},${marginX},${marginV},1`, '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events, ''
  ].join('\n');

  return { ass, fonts: [...new Set([font.file, ...(usesDeva ? [DEVA_FONT.file] : [])])] };
}
