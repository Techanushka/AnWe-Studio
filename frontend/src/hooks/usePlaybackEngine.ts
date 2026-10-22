import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useEditorStore } from '../store/editorStore';
import { usePlayhead } from '../store/playheadStore';
import { findCutIn, wordAtTime } from '../utils/editModel';

/**
 * Plays the source video but SKIPS cut ranges, keeping picture and sound together (Feature 2).
 *
 * Why this stays in sync: there is one <video> element, so audio and video always move together. A cut is skipped
 * by setting currentTime once, and the browser re-aligns both tracks. To make the skip land on the cut boundary
 * (and not up to a frame late), every animation frame looks one frame AHEAD (rate × 20 ms) for a cut. The loop
 * reads the latest cuts from the store each frame, so deleting words while playing takes effect immediately.
 */
export function usePlaybackEngine(videoRef: RefObject<HTMLVideoElement>, src: string, skip: boolean, onError: (failed: boolean) => void): void {
  const skipRef = useRef(skip);
  skipRef.current = skip;
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const S = useEditorStore.getState;
    let raf = 0;

    const publish = () => {
      const t = v.currentTime;
      usePlayhead.getState().set(t);
      S().setActive(wordAtTime(S().words, t));
    };
    const skipCuts = () => {
      if (!skipRef.current || v.paused || v.seeking) return;
      const t = v.currentTime;
      const ahead = Math.max(0.02, v.playbackRate * 0.02);
      const cut = findCutIn(S().cuts, t, t + ahead);
      if (!cut) return;
      const end = v.duration || S().duration || Infinity;
      if (cut.end >= end - 0.05) { v.pause(); v.currentTime = Math.max(0, cut.start - 0.001); } // the edit ends here
      else v.currentTime = cut.end;
    };
    const tick = () => { skipCuts(); publish(); raf = requestAnimationFrame(tick); };

    const onPlay = () => { S().setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
    const onStop = () => { S().setPlaying(false); cancelAnimationFrame(raf); publish(); };
    const onMeta = () => {
      if (Number.isFinite(v.duration)) S().setDuration(v.duration);
      if (v.videoWidth && v.videoHeight) S().setVideoSize({ w: v.videoWidth, h: v.videoHeight });
      errRef.current(false);
    };
    const onErr = () => errRef.current(true);
    // Animation frames are throttled in a background tab, which would let cuts slip by, so pause there.
    const onVisibility = () => { if (document.hidden && !v.paused) v.pause(); };

    const events: Array<[string, () => void]> = [
      ['play', onPlay], ['pause', onStop], ['ended', onStop], ['seeked', publish], ['timeupdate', publish],
      ['loadedmetadata', onMeta], ['error', onErr]
    ];
    events.forEach(([n, f]) => v.addEventListener(n, f));
    document.addEventListener('visibilitychange', onVisibility);
    if (v.readyState >= 1) onMeta();
    if (!v.paused) onPlay();
    return () => {
      cancelAnimationFrame(raf);
      events.forEach(([n, f]) => v.removeEventListener(n, f));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [videoRef, src]);
}
