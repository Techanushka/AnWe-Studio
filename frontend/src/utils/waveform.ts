/** Audio waveform for the timeline (Web Audio API). Peaks are small (one byte per bucket) so they can be cached. */
export const PEAKS_PER_SEC = 50;
const MAX_PEAKS = 60000;
export const MAX_WAVEFORM_MB = 500; // the file is decoded in memory, same limit as transcription

/** Reduces raw samples to 0..255 peak buckets, normalised to the loudest part. Pure function (tested). */
export function peaksFromChannels(channels: Float32Array[], sampleRate: number): Uint8Array {
  const length = channels[0]?.length ?? 0;
  if (!length || !sampleRate) return new Uint8Array(0);
  const n = Math.max(1, Math.min(MAX_PEAKS, Math.ceil((length / sampleRate) * PEAKS_PER_SEC)));
  const raw = new Float32Array(n);
  const per = length / n;
  let loudest = 0;
  for (let b = 0; b < n; b++) {
    const s = Math.floor(b * per);
    const e = Math.max(s + 1, Math.min(length, Math.floor((b + 1) * per)));
    const step = Math.max(1, Math.floor((e - s) / 64)); // sampling is plenty for a picture
    let m = 0;
    for (const ch of channels) for (let i = s; i < e; i += step) { const v = Math.abs(ch[i]); if (v > m) m = v; }
    raw[b] = m;
    if (m > loudest) loudest = m;
  }
  const gain = loudest > 0 ? 1 / loudest : 0;
  const out = new Uint8Array(n);
  for (let b = 0; b < n; b++) out[b] = Math.round(Math.min(1, raw[b] * gain) * 255);
  return out;
}

/** Decodes the audio track of a video (File, Blob or bytes) and returns its peaks. */
export async function decodePeaks(source: Blob | ArrayBuffer): Promise<Uint8Array> {
  const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctx = W.AudioContext || W.webkitAudioContext;
  if (!Ctx) throw new Error('This browser has no Web Audio support.');
  const bytes = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
  let ctx: AudioContext;
  try { ctx = new Ctx({ sampleRate: 8000 }); } catch { ctx = new Ctx(); } // 8 kHz keeps memory low; it's only a picture
  try {
    const decoded = await ctx.decodeAudioData(bytes);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c));
    return peaksFromChannels(channels, decoded.sampleRate);
  } finally {
    void ctx.close?.();
  }
}

/** Loads peaks from a local file or a same-origin / CORS-enabled URL. */
export async function loadPeaks(input: { file: File | null; url: string }): Promise<Uint8Array> {
  if (input.file) {
    if (input.file.size > MAX_WAVEFORM_MB * 1024 * 1024) throw new Error(`The waveform is skipped for videos over ${MAX_WAVEFORM_MB} MB.`);
    return decodePeaks(input.file);
  }
  if (!input.url) throw new Error('No video to read.');
  const res = await fetch(input.url, { credentials: 'include' });
  if (!res.ok) throw new Error('The video could not be downloaded for the waveform.');
  const size = Number(res.headers.get('content-length') || 0);
  if (size > MAX_WAVEFORM_MB * 1024 * 1024) throw new Error(`The waveform is skipped for videos over ${MAX_WAVEFORM_MB} MB.`);
  return decodePeaks(await res.arrayBuffer());
}

/** Largest peak (0..255) between two fractional positions of the peaks array. */
export function peakBetween(peaks: Uint8Array, from: number, to: number): number {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil(to)));
  let m = 0;
  for (let i = a; i < b; i++) if (peaks[i] > m) m = peaks[i];
  return m;
}
