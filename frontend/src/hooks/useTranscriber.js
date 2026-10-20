import { useCallback, useEffect, useRef, useState } from 'react';
import { extractAudio16k } from '../utils/audio.js';

export const MAX_TRANSCRIBE_MB = 500; // the whole file is decoded in memory, so keep a sane limit
export const MODELS = [
  { id: 'Xenova/whisper-tiny', label: 'Fast (about 40 MB)' },
  { id: 'Xenova/whisper-base', label: 'Better accuracy (about 80 MB)' }
];
export const LANGUAGES = [
  { id: 'auto', label: 'Detect automatically' }, { id: 'english', label: 'English' }, { id: 'hindi', label: 'Hindi' },
  { id: 'spanish', label: 'Spanish' }, { id: 'french', label: 'French' }, { id: 'german', label: 'German' },
  { id: 'portuguese', label: 'Portuguese' }, { id: 'arabic', label: 'Arabic' }
];
export const DEFAULT_OPTIONS = { language: 'auto', model: MODELS[0].id };

const INITIAL = { status: 'idle', error: '', segments: [], modelProgress: 0, doneSeconds: 0, totalSeconds: 0 };
export const isRunning = (status) => status === 'reading' || status === 'loading' || status === 'transcribing';

/** Speech-to-text for one video file. Audio is decoded here, Whisper runs in a Web Worker. */
export default function useTranscriber() {
  const [state, setState] = useState(INITIAL);
  const workerRef = useRef(null);
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current += 1;
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const reset = useCallback(() => { stop(); setState(INITIAL); }, [stop]);
  const cancel = useCallback(() => { stop(); setState((s) => ({ ...s, status: 'cancelled' })); }, [stop]);

  const start = useCallback(async (file, { language, model } = DEFAULT_OPTIONS) => {
    stop();
    const run = runRef.current;
    const fail = (message) => { if (run === runRef.current) setState({ ...INITIAL, status: 'error', error: message }); };

    if (file.size > MAX_TRANSCRIBE_MB * 1024 * 1024) {
      fail(`In-browser transcription supports videos up to ${MAX_TRANSCRIBE_MB} MB. This one is larger, so trim it first or wait for server-side transcription.`);
      return;
    }
    setState({ ...INITIAL, status: 'reading' });

    let audio;
    try { audio = await extractAudio16k(file); } catch (error) { fail(error.message); return; }
    if (run !== runRef.current) return;
    const totalSeconds = audio.length / 16000;
    if (totalSeconds < 0.5) { fail('This video has no audio to transcribe.'); return; }

    let worker;
    try { worker = new Worker(new URL('../workers/transcribeWorker.js', import.meta.url), { type: 'module' }); }
    catch { fail('This browser can’t start the transcription engine.'); return; }
    workerRef.current = worker;
    setState((s) => ({ ...s, status: 'loading', totalSeconds }));

    const finish = () => { worker.terminate(); if (workerRef.current === worker) workerRef.current = null; };
    worker.onmessage = ({ data }) => {
      if (run !== runRef.current) return;
      if (data.type === 'status') setState((s) => ({ ...s, status: data.status }));
      else if (data.type === 'model-progress') setState((s) => ({ ...s, modelProgress: data.progress }));
      else if (data.type === 'segments') setState((s) => ({ ...s, segments: [...s.segments, ...data.segments], doneSeconds: data.doneSeconds }));
      else if (data.type === 'complete') { setState((s) => ({ ...s, status: 'done', doneSeconds: s.totalSeconds })); finish(); }
      else if (data.type === 'error') { fail(data.message); finish(); }
    };
    worker.onerror = () => { fail('The speech model couldn’t load. Check your internet connection (it’s needed once to download the model) and try again.'); finish(); };
    worker.postMessage({ audio, language, model }, [audio.buffer]);
  }, [stop]);

  return { ...state, start, cancel, reset };
}
