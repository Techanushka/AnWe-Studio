/**
 * Energy-based speech detection + chunk planning.
 * Instead of cutting audio every 30 s (which slices words in half), speech is grouped into chunks of
 * at most ~28 s that start and end in silence. Silence is skipped entirely, which also removes the
 * main cause of Whisper "hallucinations". Expects audio that went through normalizeAudio().
 */
export const RATE = 16000;
const FRAME = 480; // 30 ms
const FPS = RATE / FRAME;

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

function energiesDb(a) {
  const n = Math.floor(a.length / FRAME);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const o = f * FRAME;
    for (let i = 0; i < FRAME; i++) { const v = a[o + i]; s += v * v; }
    out[f] = 20 * Math.log10(Math.sqrt(s / FRAME) + 1e-9);
  }
  return out;
}

function quietestTime(db, from, to) {
  const lo = Math.max(2, Math.floor(from * FPS)), hi = Math.min(db.length - 3, Math.floor(to * FPS));
  let best = lo, bestV = Infinity;
  for (let i = lo; i <= hi; i++) {
    let v = 0;
    for (let k = -2; k <= 2; k++) v += db[i + k];
    if (v < bestV) { bestV = v; best = i; }
  }
  return (best + 0.5) / FPS;
}

export function detectSpeechChunks(audio, options = {}) {
  const o = { maxChunk: 28, pad: 0.25, minSpeech: 0.25, mergeGap: 0.4, splitGap: 2, ...options };
  const db = energiesDb(audio);
  const n = db.length;
  if (n < 10) return [];
  const sorted = Float32Array.from(db).sort();
  const noise = pct(sorted, 0.1), loud = pct(sorted, 0.9);
  if (loud - noise < 7) return []; // flat energy = steady noise/hum, not speech
  const thr = Math.max(-58, Math.min(Math.max(noise + 10, -48), loud - 12));

  // speech runs -> merge short gaps -> drop blips
  let regions = [];
  for (let i = 0; i < n;) {
    if (db[i] <= thr) { i++; continue; }
    let j = i;
    while (j < n && db[j] > thr) j++;
    regions.push([i / FPS, j / FPS]);
    i = j;
  }
  const merged = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < o.mergeGap) last[1] = r[1]; else merged.push([...r]);
  }
  const total = audio.length / RATE;
  regions = merged.filter((r) => r[1] - r[0] >= o.minSpeech)
    .map((r) => [Math.max(0, r[0] - o.pad), Math.min(total, r[1] + o.pad)]);
  for (let i = regions.length - 1; i > 0; i--) {
    if (regions[i][0] <= regions[i - 1][1]) { regions[i - 1][1] = Math.max(regions[i - 1][1], regions[i][1]); regions.splice(i, 1); }
  }

  // pack regions into chunks
  const packed = [];
  let cur = null;
  for (const r of regions) {
    if (cur && r[0] - cur.end <= o.splitGap && r[1] - cur.start <= o.maxChunk) cur.end = r[1];
    else { if (cur) packed.push(cur); cur = { start: r[0], end: r[1] }; }
  }
  if (cur) packed.push(cur);

  // split anything longer than maxChunk at its quietest point
  const out = [];
  for (let c of packed) {
    while (c.end - c.start > o.maxChunk) {
      const cut = quietestTime(db, c.start + o.maxChunk * 0.6, c.start + o.maxChunk);
      out.push({ start: c.start, end: cut });
      c = { start: cut, end: c.end };
    }
    out.push(c);
  }
  return out.filter((c) => c.end - c.start >= 0.3);
}
