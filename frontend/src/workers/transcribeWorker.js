/**
 * Runs Whisper (speech-to-text) fully in the browser via transformers.js.
 * Input : { audio: Float32Array (16 kHz mono), language: 'auto' | 'english' | ..., model: string }
 * Output: messages { type: 'status' | 'model-progress' | 'segments' | 'complete' | 'error', ... }
 * The audio never leaves the device; only the model files are downloaded (then cached by the browser).
 */
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

const RATE = 16000;
const WINDOW = 30 * RATE;      // Whisper works on 30-second windows
const SILENCE_RMS = 0.004;     // skip silent windows (Whisper tends to invent text for silence)

let transcriber = null;
let loadedModel = null;

function rms(samples) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < samples.length; i += 16) { sum += samples[i] * samples[i]; n += 1; }
  return Math.sqrt(sum / Math.max(1, n));
}

async function loadModel(model) {
  if (transcriber && loadedModel === model) return;
  self.postMessage({ type: 'status', status: 'loading' });
  const files = {};
  transcriber = await pipeline('automatic-speech-recognition', model, {
    quantized: true,
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.file) return;
      files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
      const all = Object.values(files);
      const loaded = all.reduce((a, f) => a + f.loaded, 0);
      const total = all.reduce((a, f) => a + f.total, 0);
      self.postMessage({ type: 'model-progress', progress: total ? Math.round((loaded / total) * 100) : 0 });
    }
  });
  loadedModel = model;
}

self.onmessage = async ({ data }) => {
  const { audio, language, model } = data;
  try {
    await loadModel(model);
    self.postMessage({ type: 'status', status: 'transcribing' });

    for (let start = 0; start < audio.length; start += WINDOW) {
      const chunk = audio.subarray(start, Math.min(start + WINDOW, audio.length));
      const offset = start / RATE;
      const doneSeconds = Math.min(audio.length, start + WINDOW) / RATE;

      if (chunk.length < RATE * 0.5 || rms(chunk) < SILENCE_RMS) {
        self.postMessage({ type: 'segments', segments: [], doneSeconds });
        continue;
      }

      const result = await transcriber(chunk, {
        return_timestamps: true,
        task: 'transcribe',
        ...(language && language !== 'auto' ? { language } : {})
      });

      const windowLength = chunk.length / RATE;
      const raw = result.chunks?.length ? result.chunks : [{ text: result.text, timestamp: [0, windowLength] }];
      const segments = raw
        .map((c) => ({
          start: offset + (c.timestamp?.[0] ?? 0),
          end: offset + (c.timestamp?.[1] ?? windowLength),
          text: (c.text || '').trim()
        }))
        .filter((s) => s.text && !/^[\[(].*[\])]$/.test(s.text)); // drop [BLANK_AUDIO], (music) markers

      self.postMessage({ type: 'segments', segments, doneSeconds });
    }
    self.postMessage({ type: 'complete' });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || 'The speech model failed to run.' });
  }
};
