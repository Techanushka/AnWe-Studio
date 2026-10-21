/**
 * Cleans up decoded 16 kHz mono audio IN PLACE before speech recognition:
 *  - removes DC offset and low-frequency rumble (first-order 70 Hz high-pass)
 *  - boosts quiet recordings (peak-normalises to about -1 dBFS, max +28 dB) so quiet speech isn't treated as silence
 * Returns { silent, gainDb }.
 */
const RATE = 16000;

export function normalizeAudio(a) {
  const n = a.length;
  if (!n) return { silent: true, gainDb: 0 };

  let mean = 0;
  for (let i = 0; i < n; i++) mean += a[i];
  mean /= n;
  for (let i = 0; i < n; i++) a[i] -= mean;

  const rc = 1 / (2 * Math.PI * 70);
  const alpha = rc / (rc + 1 / RATE);
  let px = a[0];
  let py = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = alpha * (py + x - px);
    px = x; py = y; a[i] = y;
  }

  // 99.9th percentile of |sample| (ignores rare clicks) via a histogram.
  const BINS = 4096, MAXV = 1.5;
  const hist = new Uint32Array(BINS);
  let max = 0;
  for (let i = 0; i < n; i++) { const v = Math.abs(a[i]); if (v > max) max = v; hist[Math.min(BINS - 1, (v / MAXV * BINS) | 0)]++; }
  if (max < 2e-4) return { silent: true, gainDb: 0 }; // digital silence
  let acc = 0, p = 0;
  const target = n * 0.999;
  for (let b = 0; b < BINS; b++) { acc += hist[b]; if (acc >= target) { p = ((b + 1) / BINS) * MAXV; break; } }
  if (p < 1e-4) return { silent: true, gainDb: 0 };

  const gain = Math.min(25, Math.max(0.5, 0.9 / p));
  for (let i = 0; i < n; i++) { const v = a[i] * gain; a[i] = v > 1 ? 1 : v < -1 ? -1 : v; }
  return { silent: false, gainDb: 20 * Math.log10(gain) };
}
