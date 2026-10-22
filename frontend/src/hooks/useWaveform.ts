import { useEffect, useState } from 'react';
import { loadPeaks } from '../utils/waveform';
import { savePeaks } from '../services/editorStorage';

export type WaveStatus = 'loading' | 'ready' | 'unavailable';

/** Waveform peaks for the timeline: from the cache if there is one, otherwise decoded with the Web Audio API once. */
export function useWaveform(projectId: string, file: File | null, url: string, cached: Uint8Array | null) {
  const [state, setState] = useState<{ status: WaveStatus; peaks: Uint8Array | null; message: string }>(
    cached?.length ? { status: 'ready', peaks: cached, message: '' } : { status: 'loading', peaks: null, message: '' }
  );

  useEffect(() => {
    if (cached?.length) { setState({ status: 'ready', peaks: cached, message: '' }); return undefined; }
    if (!file && !url) return undefined;
    let alive = true;
    setState({ status: 'loading', peaks: null, message: '' });
    loadPeaks({ file, url }).then((peaks) => {
      if (!alive) return;
      if (!peaks.length) { setState({ status: 'unavailable', peaks: null, message: 'This video has no audio track to draw.' }); return; }
      setState({ status: 'ready', peaks, message: '' });
      savePeaks(projectId, peaks).catch(() => {});
    }).catch((error: Error) => alive && setState({ status: 'unavailable', peaks: null, message: error.message || 'The waveform could not be drawn.' }));
    return () => { alive = false; };
  }, [projectId, file, url, cached]);

  return state;
}
