import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, RefObject } from 'react';
import Icon from '../dashboard/Icon.jsx';
import { useEditorStore } from '../../store/editorStore';
import { usePlayhead } from '../../store/playheadStore';
import { usePlaybackEngine } from '../../hooks/usePlaybackEngine';
import { cropRect, editedToSource, sourceToEdited, totalLength } from '../../utils/editModel';
import { formatTime } from '../../utils/transcript.js';

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function Scrubber({ videoRef, skip }: { videoRef: RefObject<HTMLVideoElement>; skip: boolean }) {
  const cuts = useEditorStore((s) => s.cuts);
  const keep = useEditorStore((s) => s.keep);
  const duration = useEditorStore((s) => s.duration);
  const total = skip ? totalLength(keep) : duration;
  const value = usePlayhead((s) => (total > 0 ? Math.round(Math.min(1, Math.max(0, (skip ? sourceToEdited(s.time, cuts) : s.time) / total)) * 1000) : 0));
  const seek = (v: number) => {
    const el = videoRef.current;
    if (!el || total <= 0) return;
    const t = skip ? editedToSource((v / 1000) * total, keep) : (v / 1000) * total;
    el.currentTime = Math.min(el.duration || duration || t, Math.max(0, t));
  };
  return (
    <input type="range" className="ed-scrub" min={0} max={1000} value={value} onChange={(e) => seek(Number(e.target.value))}
      aria-label={skip ? 'Seek in the edited video' : 'Seek in the original video'} style={{ '--p': `${value / 10}%` } as CSSProperties} />
  );
}

function Readout({ skip }: { skip: boolean }) {
  const cuts = useEditorStore((s) => s.cuts);
  const keep = useEditorStore((s) => s.keep);
  const duration = useEditorStore((s) => s.duration);
  const tenth = usePlayhead((s) => Math.floor(s.time * 10));
  const t = tenth / 10;
  const edited = totalLength(keep);
  return <span className="ed-clock" aria-hidden="true">{formatTime(skip ? sourceToEdited(t, cuts) : t)} / {formatTime(skip ? edited : duration)}</span>;
}

/**
 * Video preview with its own controls (play/pause, seek, speed, volume). While playing it SKIPS the deleted and trimmed
 * parts (see usePlaybackEngine) and shows the crop. The video file itself is never changed.
 */
export default function VideoPreview({ src, videoRef }: { src: string; videoRef: RefObject<HTMLVideoElement> }) {
  const duration = useEditorStore((s) => s.duration);
  const keep = useEditorStore((s) => s.keep);
  const cuts = useEditorStore((s) => s.cuts);
  const crop = useEditorStore((s) => s.doc.crop);
  const videoSize = useEditorStore((s) => s.videoSize);
  const playing = useEditorStore((s) => s.playing);
  const [skip, setSkip] = useState(true);
  const [failed, setFailed] = useState(false);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  usePlaybackEngine(videoRef, src, skip, setFailed);
  useEffect(() => { const v = videoRef.current; if (v) { v.defaultPlaybackRate = rate; v.playbackRate = rate; } }, [rate, src, videoRef]);
  useEffect(() => { const v = videoRef.current; if (v) { v.volume = volume; v.muted = muted; } }, [volume, muted, src, videoRef]);

  const removed = totalLength(cuts);
  const edited = Math.max(0, duration - removed);
  const nothingLeft = duration > 0 && keep.length === 0;

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) { v.pause(); return; }
    const { keep: k } = useEditorStore.getState();
    if (skip && k.length && v.currentTime >= k[k.length - 1].end - 0.05) v.currentTime = k[0].start; // replay from the start
    void v.play().catch(() => {});
  };
  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const s = useEditorStore.getState();
    if (skip && s.keep.length) {
      const te = Math.min(totalLength(s.keep), Math.max(0, sourceToEdited(v.currentTime, s.cuts) + delta));
      v.currentTime = editedToSource(te, s.keep);
    } else v.currentTime = Math.min(v.duration || Infinity, Math.max(0, v.currentTime + delta));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input,select,textarea,button')) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(e.shiftKey ? -10 : -5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(e.shiftKey ? 10 : 5); }
    else if (e.key === 'm') setMuted((m) => !m);
  };

  const rect = crop && videoSize ? cropRect(crop, videoSize) : null;
  const ratio = rect && videoSize ? (rect.w * videoSize.w) / (rect.h * videoSize.h) : videoSize ? videoSize.w / videoSize.h : 16 / 9;
  const videoStyle: CSSProperties | undefined = rect
    ? { position: 'absolute', width: `${100 / rect.w}%`, height: `${100 / rect.h}%`, left: `${(-rect.x / rect.w) * 100}%`, top: `${(-rect.y / rect.h) * 100}%`, objectFit: 'fill' }
    : undefined;

  return (
    <div className="ed-video card" ref={cardRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Video preview. Space plays or pauses, arrow keys seek.">
      <div className="ed-stage" style={{ '--ar': ratio } as CSSProperties}>
        <video ref={videoRef} src={src || undefined} playsInline preload="metadata" style={videoStyle} onClick={toggle} />
        {crop && <span className="ed-crop-badge">Crop {crop.aspect}</span>}
        {nothingLeft && <p className="ed-stage-note">Everything is deleted or trimmed. Restore something to preview it.</p>}
      </div>
      {failed && <p className="msg bad" role="alert">This browser can’t play this video file (the codec may not be supported). The transcript still works, but the preview doesn’t.</p>}

      <Scrubber videoRef={videoRef} skip={skip} />

      <div className="ed-controls">
        <button type="button" className="icon-btn play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>
        <Readout skip={skip} />
        <label className="ed-speed">
          <span className="sr-only">Playback speed</span>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Playback speed">
            {SPEEDS.map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        <button type="button" className="icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'} title="Mute (M)">
          <Icon name={muted || volume === 0 ? 'mute' : 'volume'} size={19} />
        </button>
        <input type="range" className="ed-vol" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume"
          onChange={(e) => { const n = Number(e.target.value); setVolume(n); setMuted(n === 0); }} />
      </div>

      <div className="ed-times">
        <span className="muted">{removed > 0 ? `Edited ${formatTime(edited)}, original ${formatTime(duration)} (${formatTime(removed)} removed)` : `Length ${formatTime(duration)}, nothing deleted yet`}</span>
        <label className="switch">
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          <span>Skip cuts</span>
        </label>
      </div>
    </div>
  );
}
