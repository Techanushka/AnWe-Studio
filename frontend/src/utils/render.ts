/**
 * In-browser video renderer (FFmpeg.wasm, single-thread core: needs no special server headers).
 * One job = "keep these source ranges, join them, optionally crop, optionally burn an ASS caption file".
 * Used by Feature 5 (export with captions) and Feature 6 (export each highlight clip).
 * Memory note: the whole source video is loaded into WebAssembly memory, so very large files (>~1 GB) can fail.
 */
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { Range } from '../types/editor';

export interface RenderSource { file: File | null; url: string }
export interface CropBox { x: number; y: number; w: number; h: number }
export interface RenderJob {
  source: RenderSource;
  pieces: Range[];
  crop: CropBox | null;
  ass: string | null;
  fonts: string[];
  onProgress?: (fraction: number, stage: string) => void;
  signal?: AbortSignal;
}

const API_BASE: string = import.meta.env.VITE_API_BASE_URL || '';
const CORE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
const MAX_PIECES = 300;

let engine: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let input: { key: File | string; name: string; audio: boolean } | null = null;

async function getEngine(): Promise<FFmpeg> {
  if (engine) return engine;
  if (!loading) {
    loading = (async () => {
      const [{ FFmpeg: FF }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
      const ff = new FF();
      await ff.load({
        coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm')
      });
      engine = ff;
      return ff;
    })().finally(() => { loading = null; });
  }
  return loading;
}
function dropEngine() { engine?.terminate(); engine = null; input = null; }

async function fetchVideo(url: string): Promise<Uint8Array> {
  const full = url.startsWith('/') && API_BASE && !url.startsWith(API_BASE) ? `${API_BASE}${url}` : url;
  // The server answers with a redirect to a signed cloud URL: try with the session cookie, then without.
  let res: Response | null = null;
  for (const credentials of ['include', 'same-origin'] as const) {
    try { res = await fetch(full, { credentials }); if (res.ok) break; } catch { res = null; }
  }
  if (!res || !res.ok) throw new Error('Could not download the video for export. Try again, or re-upload the video from this browser.');
  return new Uint8Array(await res.arrayBuffer());
}

async function probeAudio(ff: FFmpeg, name: string): Promise<boolean> {
  let found = false;
  const onLog = ({ message }: { message: string }) => { if (/Stream #\d+:\d+.*Audio:/.test(message)) found = true; };
  ff.on('log', onLog);
  try { await ff.exec(['-hide_banner', '-i', name, '-t', '0.05', '-f', 'null', '-']); } finally { ff.off('log', onLog); }
  return found;
}

async function ensureInput(ff: FFmpeg, source: RenderSource) {
  const key = source.file ?? source.url;
  if (input && input.key === key) return input; // several clips from the same video reuse the loaded copy
  if (input) { await ff.deleteFile(input.name).catch(() => undefined); input = null; }
  const data = source.file ? new Uint8Array(await source.file.arrayBuffer()) : await fetchVideo(source.url);
  const ext = (source.file?.name.match(/\.(mp4|mov|webm|m4v)$/i)?.[0] ?? '.mp4').toLowerCase();
  const name = `input${ext}`;
  await ff.writeFile(name, data);
  input = { key, name, audio: await probeAudio(ff, name) };
  return input;
}

async function writeFonts(ff: FFmpeg, fonts: string[]) {
  await ff.createDir('/tmp').catch(() => undefined);
  for (const f of fonts) {
    const res = await fetch(`/fonts/${f}`);
    // The dev server answers a missing file with index.html (status 200), so check the content type too.
    if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) {
      throw new Error(`Caption font missing: put ${f} in frontend/public/fonts/ (see CHANGES.md, step 4).`);
    }
    await ff.writeFile(`/tmp/${f}`, new Uint8Array(await res.arrayBuffer()));
  }
}

const abortError = () => new DOMException('Cancelled', 'AbortError');

export async function renderVideo(job: RenderJob): Promise<Blob> {
  const { source, pieces, crop, ass, fonts, onProgress = () => undefined, signal } = job;
  if (!pieces.length) throw new Error('Nothing to export in this range.');
  if (pieces.length > MAX_PIECES) throw new Error(`This edit has ${pieces.length} separate pieces (limit ${MAX_PIECES}). Accept fewer cleanup suggestions and try again.`);
  if (signal?.aborted) throw abortError();

  onProgress(0, 'Loading video engine…');
  const ff = await getEngine();
  const onAbort = () => dropEngine();
  signal?.addEventListener('abort', onAbort, { once: true });
  const onProg = ({ progress }: { progress: number }) => onProgress(Math.min(0.99, Math.max(0, progress)), 'Rendering…');
  ff.on('progress', onProg);

  try {
    onProgress(0, 'Reading video…');
    const src = await ensureInput(ff, source);
    if (ass) { await writeFonts(ff, fonts); await ff.writeFile('captions.ass', ass); }

    const n = (x: number) => x.toFixed(3);
    const parts: string[] = [];
    pieces.forEach((p, i) => {
      parts.push(`[0:v]trim=start=${n(p.start)}:end=${n(p.end)},setpts=PTS-STARTPTS[v${i}]`);
      if (src.audio) parts.push(`[0:a]atrim=start=${n(p.start)}:end=${n(p.end)},asetpts=PTS-STARTPTS[a${i}]`);
    });
    const ins = pieces.map((_, i) => `[v${i}]${src.audio ? `[a${i}]` : ''}`).join('');
    parts.push(`${ins}concat=n=${pieces.length}:v=1:a=${src.audio ? 1 : 0}[vc]${src.audio ? '[ac]' : ''}`);
    const vf: string[] = [];
    if (crop) vf.push(`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`);
    if (ass) vf.push('ass=captions.ass:fontsdir=/tmp');
    vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2', 'format=yuv420p');
    parts.push(`[vc]${vf.join(',')}[vo]`);

    const code = await ff.exec([
      '-i', src.name, '-filter_complex', parts.join(';'), '-map', '[vo]', ...(src.audio ? ['-map', '[ac]'] : []),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', ...(src.audio ? ['-c:a', 'aac', '-b:a', '160k'] : []),
      '-movflags', '+faststart', '-y', 'out.mp4'
    ]);
    if (signal?.aborted) throw abortError();
    if (code !== 0) throw new Error('The video engine could not render this edit. Try a shorter range or a smaller video.');
    const data = await ff.readFile('out.mp4');
    await ff.deleteFile('out.mp4').catch(() => undefined);
    onProgress(1, 'Done');
    return new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
  } catch (e) {
    if (signal?.aborted) throw abortError();
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    ff.off('progress', onProg);
  }
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}