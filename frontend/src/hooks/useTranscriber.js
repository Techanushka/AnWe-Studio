import { useCallback, useEffect, useRef, useState } from 'react';
import { extractAudio16k } from '../utils/audio.js';
import { TRANSCRIBE_URL, transcribeOnServer } from '../services/transcribeApi.js';

export const SERVER_MODE = Boolean(TRANSCRIBE_URL); // true -> the file is sent to your transcription server (best accuracy)
export const MAX_TRANSCRIBE_MB = 500; // browser mode decodes the whole file in memory, so keep a sane limit
export const MODELS = [
  { id: 'Xenova/whisper-small', label: 'Best in browser (about 250 MB)' },
  { id: 'Xenova/whisper-base', label: 'Balanced (about 80 MB)' },
  { id: 'Xenova/whisper-tiny', label: 'Fastest, least accurate (about 40 MB)' }
];
export const LANGUAGES = [
  { id: 'auto', label: 'Detect automatically' }, { id: 'english', label: 'English' }, { id: 'hindi', label: 'Hindi' },
  { id: 'spanish', label: 'Spanish' }, { id: 'french', label: 'French' }, { id: 'german', label: 'German' },
  { id: 'portuguese', label: 'Portuguese' }, { id: 'arabic', label: 'Arabic' }
];
export const DEFAULT_OPTIONS = { language: 'auto', model: MODELS[0].id };

const INITIAL = { status: 'idle', error: '', segments: [], modelProgress: 0, uploadProgress: 0, doneSeconds: 0, totalSeconds: 0, language: '', stats: null };
export const isRunning = (status) => ['reading', 'uploading', 'loading', 'transcribing'].includes(status);

/** Speech-to-text for one video file: Whisper in a Web Worker (browser) or on your server (VITE_TRANSCRIBE_URL). */
export default function useTranscriber() {
  const [state, setState] = useState(INITIAL);
  const cleanupRef = useRef(null);
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current += 1;
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const reset = useCallback(() => { stop(); setState(INITIAL); }, [stop]);
  const cancel = useCallback(() => { stop(); setState((s) => ({ ...s, status: 'cancelled' })); }, [stop]);

  const start = useCallback(async (file, { language, model } = DEFAULT_OPTIONS) => {
    stop();
    const run = runRef.current;
    const live = () => run === runRef.current;
    const fail = (message) => { if (live()) setState({ ...INITIAL, status: 'error', error: message }); };

    // ---- Server mode: upload the video, receive segments as they are produced ----
    if (SERVER_MODE) {
      setState({ ...INITIAL, status: 'uploading' });
      const job = transcribeOnServer(file, {
        language,
        onUpload: (p) => live() && setState((s) => (s.status === 'uploading' ? { ...s, uploadProgress: p, status: p >= 100 ? 'transcribing' : 'uploading' } : s)),
        onInfo: (i) => live() && setState((s) => ({ ...s, status: 'transcribing', totalSeconds: i.duration || 0, language: i.language || '' })),
        onSegment: (seg) => live() && setState((s) => ({ ...s, status: 'transcribing', segments: [...s.segments, seg], doneSeconds: seg.end })),
        onDone: () => { if (live()) { cleanupRef.current = null; setState((s) => ({ ...s, status: 'done', doneSeconds: s.totalSeconds, stats: { server: true, kept: s.segments.length } })); } },
        onError: fail
      });
      cleanupRef.current = job.abort;
      return;
    }

    // ---- Browser mode ----
    if (file.size > MAX_TRANSCRIBE_MB * 1024 * 1024) {
      fail(`In-browser transcription supports videos up to ${MAX_TRANSCRIBE_MB} MB. This one is larger, so trim it first or connect the transcription server.`);
      return;
    }
    setState({ ...INITIAL, status: 'reading' });

    let audio;
    try { audio = await extractAudio16k(file); } catch (error) { fail(error.message); return; }
    if (!live()) return;
    const totalSeconds = audio.length / 16000;
    if (totalSeconds < 0.5) { fail('This video has no audio to transcribe.'); return; }

    let worker;
    try { worker = new Worker(new URL('../workers/transcribeWorker.js', import.meta.url), { type: 'module' }); }
    catch { fail('This browser can’t start the transcription engine.'); return; }
    cleanupRef.current = () => worker.terminate();
    setState((s) => ({ ...s, status: 'loading', totalSeconds }));

    const finish = () => { worker.terminate(); cleanupRef.current = null; };
    worker.onmessage = ({ data }) => {
      if (!live()) return;
      if (data.type === 'status') setState((s) => ({ ...s, status: data.status }));
      else if (data.type === 'model-progress') setState((s) => ({ ...s, modelProgress: data.progress }));
      else if (data.type === 'language') setState((s) => ({ ...s, language: data.language }));
      else if (data.type === 'segments') setState((s) => ({ ...s, segments: [...s.segments, ...data.segments], doneSeconds: data.doneSeconds }));
      else if (data.type === 'complete') { setState((s) => ({ ...s, status: 'done', doneSeconds: s.totalSeconds, stats: data.stats })); finish(); }
      else if (data.type === 'error') { fail(data.message); finish(); }
    };
    worker.onerror = () => { fail('The speech model couldn’t load. Check your internet connection (it’s needed once to download the model) and try again.'); finish(); };
    worker.postMessage({ audio, language, model }, [audio.buffer]);
  }, [stop]);

  return { ...state, start, cancel, reset };
}
