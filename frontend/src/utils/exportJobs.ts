import { useEditorStore } from '../store/editorStore';
import { useCaptionStore } from '../store/captionStore';
import { buildCaptionLines } from './captions';
import { buildAss } from './ass';
import { cropPixels, cropRect } from './editModel';
import type { Range } from '../types/editor';
import type { CropBox } from './render';

export const safeName = (name: string): string => (name || 'project').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'project';

/** The parts of a clip [range] that survive the user's edits (deleted words, cleanup cuts, trim). */
export function clipPieces(keep: Range[], range: Range): Range[] {
  return keep
    .map((k) => ({ start: Math.max(k.start, range.start), end: Math.min(k.end, range.end) }))
    .filter((k) => k.end - k.start > 0.05);
}

/** Everything the renderer needs for a set of pieces: crop box, caption script and fonts. */
export function planRender(pieces: Range[], withCaptions: boolean) {
  const ed = useEditorStore.getState();
  const style = useCaptionStore.getState().style;
  const size = ed.videoSize;
  if (!size) throw new Error('Wait for the video to load, then try again.');
  if (!pieces.length) throw new Error('Nothing is left in this range. Restore something first.');

  let crop: CropBox | null = null;
  let out = { w: size.w, h: size.h };
  if (ed.doc.crop) {
    const r = cropRect(ed.doc.crop, size);
    const px = cropPixels(ed.doc.crop, size);
    crop = { w: px.width, h: px.height, x: Math.max(0, Math.min(size.w - px.width, Math.round(r.x * size.w))), y: Math.max(0, Math.min(size.h - px.height, Math.round(r.y * size.h))) };
    out = { w: px.width, h: px.height };
  }

  let ass: string | null = null;
  let fonts: string[] = [];
  if (withCaptions && style.enabled) {
    const lines = buildCaptionLines(ed.words, ed.doc.captions, pieces, style.maxWords);
    if (lines.length) ({ ass, fonts } = buildAss(lines, style, out, pieces));
  }
  return { pieces, crop, ass, fonts };
}
