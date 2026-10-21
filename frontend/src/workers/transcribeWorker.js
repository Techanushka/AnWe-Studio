/**
 * In-browser Whisper (transformers.js) with an accuracy-focused pipeline:
 *  1. clean + normalise the audio (quiet recordings are boosted, rumble removed)
 *  2. find the speech and cut it into <=28 s chunks that start/end in silence (no words sliced in half, silence skipped)
 *  3. transcribe each chunk; with "auto" the language is detected once and then LOCKED for the whole video
 *  4. detect repetition loops and retry that chunk with repetition penalties, drop invented text, dedupe
 * Input : { audio: Float32Array (16 kHz mono), language: 'auto' | 'english' | ..., model: string }
 * Output: { type: 'status' | 'model-progress' | 'plan' | 'language' | 'segments' | 'complete' | 'error', ... }
 */
import { pipeline, env } from '@xenova/transformers';
import { normalizeAudio } from '../utils/asr/normalize.js';
import { detectSpeechChunks, RATE } from '../utils/asr/vad.js';
import { guessLanguage } from '../utils/asr/language.js';
import { cleanChunkSegments, collapseRepeats, dedupeConsecutive, hasRepetitionLoop } from '../utils/asr/postprocess.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;
let loadedModel = null;

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

/** One Whisper pass over one chunk. Returns segments relative to the chunk start. */
async function decode(samples, language, extra = {}) {
  const len = samples.length / RATE;
  const result = await transcriber(samples, {
    return_timestamps: true,
    task: 'transcribe',
    ...(language ? { language } : {}),
    ...extra
  });
  const raw = result.chunks?.length ? result.chunks : [{ text: result.text, timestamp: [0, len] }];
  const segs = raw.map((c) => {
    const start = Math.min(len, Math.max(0, c.timestamp?.[0] ?? 0));
    const end = c.timestamp?.[1] == null ? len : Math.min(len, Math.max(start, c.timestamp[1]));
    return { start, end, text: (c.text || '').trim() };
  });
  // Whisper sometimes returns zero-length/overlapping stamps; make them sane.
  for (let i = 0; i < segs.length; i++) {
    const next = segs[i + 1];
    if (segs[i].end - segs[i].start < 0.2) segs[i].end = Math.min(len, next ? Math.max(segs[i].start + 0.2, Math.min(next.start, segs[i].start + 3)) : len);
  }
  return segs;
}

async function decodeChecked(samples, language) {
  let segs = await decode(samples, language);
  if (hasRepetitionLoop(segs.map((s) => s.text).join(' '))) {
    const retry = await decode(samples, language, { no_repeat_ngram_size: 3, repetition_penalty: 1.2 });
    if (retry.length) segs = retry;
  }
  return segs;
}

self.onmessage = async ({ data }) => {
  const { audio, language, model } = data;
  try {
    const { silent, gainDb } = normalizeAudio(audio);
    const chunks = silent ? [] : detectSpeechChunks(audio);
    const speechSeconds = chunks.reduce((s, c) => s + (c.end - c.start), 0);
    self.postMessage({ type: 'plan', speechSeconds, chunks: chunks.length, silent, gainDb });
    if (!chunks.length) {
      self.postMessage({ type: 'complete', stats: { speechSeconds: 0, chunks: 0, silent } });
      return;
    }

    await loadModel(model);
    self.postMessage({ type: 'status', status: 'transcribing' });

    let lang = language && language !== 'auto' ? language : null;
    let detectTries = 0;
    let kept = 0;
    let dropped = 0;
    const all = [];

    for (const c of chunks) {
      const samples = audio.subarray(Math.floor(c.start * RATE), Math.min(audio.length, Math.ceil(c.end * RATE)));
      let segs = await decodeChecked(samples, lang);

      // "Auto": work out the language from the first chunks, then lock it for the rest of the video.
      if (!lang && detectTries < 3 && segs.length) {
        detectTries += 1;
        const guess = guessLanguage(segs.map((s) => s.text).join(' '));
        if (guess) {
          lang = guess;
          self.postMessage({ type: 'language', language: guess });
          if (guess !== 'english') segs = await decodeChecked(samples, lang);
        }
      }

      const cleaned = cleanChunkSegments(segs, samples.length / RATE);
      dropped += segs.length - cleaned.length;
      kept += cleaned.length;
      const shifted = cleaned.map((s) => ({ start: c.start + s.start, end: c.start + s.end, text: s.text }));
      all.push(...shifted);
      self.postMessage({ type: 'segments', segments: shifted, doneSeconds: c.end });
    }
    self.postMessage({ type: 'complete', stats: { speechSeconds, chunks: chunks.length, kept, dropped, language: lang, silent: false, deduped: all.length - dedupeConsecutive(all).length } });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || 'The speech model failed to run.' });
  }
};
