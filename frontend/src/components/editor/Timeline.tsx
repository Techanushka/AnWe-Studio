import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import Icon from '../dashboard/Icon.jsx';
import { useEditorStore } from '../../store/editorStore';
import { usePlayhead } from '../../store/playheadStore';
import { MIN_TRIM, cutRanges, editedToSource, sourceToEdited, totalLength, trimRanges } from '../../utils/editModel';
import { peakBetween } from '../../utils/waveform';
import { formatTime } from '../../utils/transcript.js';
import type { WaveStatus } from '../../hooks/useWaveform';
import type { Range } from '../../types/editor';

const MAX_ZOOM = 32;
const MAX_WIDTH = 24000; // css px; keeps canvases inside browser limits
const TICKS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const WAVE = '#5eead4';

/** Sizes a canvas for the screen's pixel density and returns a 2D context in CSS pixels (null if unsupported). */
function prepare(canvas: HTMLCanvasElement | null, w: number, h: number): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 16000 / Math.max(1, w), 3));
  canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

interface Piece { x0: number; x1: number; p0: number; p1: number } // pixels on the track <- fractional index in peaks
function drawWave(ctx: CanvasRenderingContext2D, peaks: Uint8Array | null, h: number, pieces: Piece[]) {
  ctx.fillStyle = WAVE;
  for (const p of pieces) {
    const width = p.x1 - p.x0;
    if (width <= 0) continue;
    for (let x = 0; x < Math.ceil(width); x++) {
      const a = p.p0 + (x / width) * (p.p1 - p.p0);
      const b = p.p0 + ((x + 1) / width) * (p.p1 - p.p0);
      const amp = peaks && peaks.length ? peakBetween(peaks, a, b) / 255 : 0;
      const bar = Math.max(1, amp * (h - 8));
      ctx.fillRect(p.x0 + x, (h - bar) / 2, 1, bar);
    }
  }
}

function Readout() {
  const cuts = useEditorStore((s) => s.cuts);
  const tenth = usePlayhead((s) => Math.floor(s.time * 10));
  const t = tenth / 10;
  const inCut = cuts.some((c) => t >= c.start && t < c.end);
  return (
    <span className="tl-readout" aria-live="off">
      Source <b>{formatTime(t)}</b> <span aria-hidden="true">→</span> Edited <b>{formatTime(sourceToEdited(t, cuts))}</b>{inCut ? <em> (inside a cut)</em> : null}
    </span>
  );
}

interface Props { onSeek: (t: number) => void; peaks: Uint8Array | null; waveStatus: WaveStatus; waveMessage: string }
type Side = 'start' | 'end';

/**
 * Interactive timeline (Feature 2). Two tracks share one scale:
 *  - Source: the original video with its waveform, cut ranges (red), trimmed ends (grey) and draggable trim handles.
 *  - Edited: the clips that remain, joined together, with a marker at every cut boundary.
 * The playhead is drawn on both, so you can see how a source time maps to the edited video.
 */
export default function Timeline({ onSeek, peaks, waveStatus, waveMessage }: Props) {
  const duration = useEditorStore((s) => s.duration);
  const cuts = useEditorStore((s) => s.cuts);
  const keep = useEditorStore((s) => s.keep);
  const runs = useEditorStore((s) => s.runs);
  const trim = useEditorStore((s) => s.doc.trim);

  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const srcWaveRef = useRef<HTMLCanvasElement>(null);
  const editWaveRef = useRef<HTMLCanvasElement>(null);
  const srcHeadRef = useRef<HTMLDivElement>(null);
  const editHeadRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef<'source' | 'edited' | null>(null);
  const anchor = useRef<number | null>(null);
  const cutsRef = useRef(cuts);
  cutsRef.current = cuts;

  const [baseW, setBaseW] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ side: Side; t: number } | null>(null);
  const dragRef = useRef<{ side: Side; t: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => setBaseW(Math.max(240, el.clientWidth));
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.min(MAX_WIDTH, baseW * zoom);
  const pps = duration > 0 ? innerW / duration : 0; // pixels per second
  const editedDuration = totalLength(keep);
  const full: Range = { start: 0, end: duration };
  const curTrim = trim ?? full;
  const shownTrim: Range | null = drag ? { ...curTrim, [drag.side]: drag.t } : trim;
  const deletedCuts = useMemo(() => cutRanges(runs, duration), [runs, duration]);
  const trimmedZones = useMemo(() => trimRanges(shownTrim, duration), [shownTrim, duration]);

  // ---- canvases (ruler + waveforms) ----
  useEffect(() => {
    if (!(pps > 0)) return;
    const ctx = prepare(rulerRef.current, innerW, 26);
    if (!ctx) return;
    const step = TICKS.find((t) => t * pps >= 90) ?? 3600;
    ctx.fillStyle = '#a9a5c9'; ctx.strokeStyle = '#2a2756'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textBaseline = 'top';
    for (let t = 0; t <= duration + 1e-6; t += step) {
      const x = Math.round(t * pps) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, 26); ctx.stroke();
      ctx.fillText(formatTime(t), x + 4, 2);
    }
  }, [innerW, pps, duration]);

  useEffect(() => {
    if (!(pps > 0)) return;
    const ctx = prepare(srcWaveRef.current, innerW, 60);
    if (ctx) drawWave(ctx, peaks, 60, [{ x0: 0, x1: innerW, p0: 0, p1: peaks?.length ?? 0 }]);
  }, [innerW, pps, peaks]);

  useEffect(() => {
    if (!(pps > 0)) return;
    const ctx = prepare(editWaveRef.current, Math.max(1, editedDuration * pps), 60);
    if (!ctx) return;
    const n = peaks?.length ?? 0;
    let x = 0;
    const pieces: Piece[] = keep.map((k) => {
      const w = (k.end - k.start) * pps;
      const piece = { x0: x, x1: x + w, p0: (k.start / duration) * n, p1: (k.end / duration) * n };
      x += w;
      return piece;
    });
    drawWave(ctx, peaks, 60, pieces);
  }, [innerW, pps, peaks, keep, duration, editedDuration]);

  // ---- playhead: moved directly on the DOM (no React render per frame) ----
  useEffect(() => {
    const place = (t: number) => {
      if (srcHeadRef.current) srcHeadRef.current.style.transform = `translateX(${t * pps}px)`;
      if (editHeadRef.current) editHeadRef.current.style.transform = `translateX(${sourceToEdited(t, cutsRef.current) * pps}px)`;
      const sc = scrollRef.current;
      if (sc && useEditorStore.getState().playing && zoom > 1) { // keep the playhead in view while playing
        const x = t * pps;
        if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 40);
      }
    };
    place(usePlayhead.getState().time);
    return usePlayhead.subscribe((s) => place(s.time));
  }, [pps, cuts, keep, zoom]);

  // keep the same moment in the middle of the view when zooming
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (sc && anchor.current != null && pps > 0) { sc.scrollLeft = Math.max(0, anchor.current * pps - sc.clientWidth / 2); anchor.current = null; }
  }, [pps]);
  const changeZoom = (next: number) => {
    const sc = scrollRef.current;
    if (sc && pps > 0) anchor.current = (sc.scrollLeft + sc.clientWidth / 2) / pps;
    setZoom(Math.min(MAX_ZOOM, Math.max(1, next)));
  };

  // ---- seeking ----
  const xOf = (clientX: number) => clientX - (innerRef.current?.getBoundingClientRect().left ?? 0);
  const seekAt = useCallback((track: 'source' | 'edited', clientX: number) => {
    if (!(pps > 0)) return;
    const x = Math.max(0, xOf(clientX));
    if (track === 'source') onSeek(Math.min(duration, x / pps));
    else if (keep.length) onSeek(editedToSource(x / pps, keep));
  }, [pps, duration, keep, onSeek]);
  const down = (track: 'source' | 'edited') => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    scrubbing.current = track;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekAt(track, e.clientX);
  };
  const move = (track: 'source' | 'edited') => (e: ReactPointerEvent<HTMLDivElement>) => { if (scrubbing.current === track) seekAt(track, e.clientX); };
  const up = () => { scrubbing.current = null; };

  const stepBy = (delta: number) => {
    const t = usePlayhead.getState().time;
    if (!keep.length) return;
    onSeek(editedToSource(Math.min(editedDuration, Math.max(0, sourceToEdited(t, cuts) + delta)), keep));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stepBy((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1)); }
    else if (e.key === 'Home') { e.preventDefault(); if (keep.length) onSeek(keep[0].start); }
    else if (e.key === 'End') { e.preventDefault(); if (keep.length) onSeek(keep[keep.length - 1].end); }
    else if (e.key === '+' || e.key === '=') changeZoom(zoom * 2);
    else if (e.key === '-') changeZoom(zoom / 2);
  };

  // ---- trim ----
  const store = useEditorStore.getState;
  const setIn = () => store().setTrim({ start: usePlayhead.getState().time, end: curTrim.end });
  const setOut = () => store().setTrim({ start: curTrim.start, end: usePlayhead.getState().time });
  const clampSide = (side: Side, t: number) => (side === 'start' ? Math.min(Math.max(0, t), curTrim.end - MIN_TRIM) : Math.max(Math.min(duration, t), curTrim.start + MIN_TRIM));
  const handleDown = (side: Side) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { side, t: side === 'start' ? curTrim.start : curTrim.end };
    setDrag(dragRef.current);
  };
  const handleMove = (side: Side) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.side !== side || !(pps > 0)) return;
    dragRef.current = { side, t: clampSide(side, xOf(e.clientX) / pps) };
    setDrag(dragRef.current);
  };
  const handleUp = () => {
    const d = dragRef.current;
    dragRef.current = null; setDrag(null);
    if (d) store().setTrim(d.side === 'start' ? { start: d.t, end: curTrim.end } : { start: curTrim.start, end: d.t }, { coalesce: 'trim-drag' });
  };
  const handleKey = (side: Side) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); e.stopPropagation();
    const dt = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 0.1);
    const t = clampSide(side, (side === 'start' ? curTrim.start : curTrim.end) + dt);
    store().setTrim(side === 'start' ? { start: t, end: curTrim.end } : { start: curTrim.start, end: t }, { coalesce: `trim-key-${side}` });
  };

  if (!(duration > 0)) {
    return <section className="ed-tl card" aria-label="Timeline"><p className="muted tl-empty">The timeline appears once the video has loaded.</p></section>;
  }

  return (
    <section className="ed-tl card" aria-label="Timeline" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="tl-bar">
        <h2>Timeline</h2>
        <Readout />
        <div className="tl-tools">
          <button type="button" className="btn ghost sm" onClick={setIn} title="Trim: start the video at the playhead"><Icon name="trim" size={15} />Set start</button>
          <button type="button" className="btn ghost sm" onClick={setOut} title="Trim: end the video at the playhead"><Icon name="trim" size={15} />Set end</button>
          <button type="button" className="btn ghost sm" onClick={() => store().setTrim(null)} disabled={!trim}>Reset trim</button>
          <span className="tl-sep" aria-hidden="true" />
          <button type="button" className="icon-btn sm" onClick={() => changeZoom(zoom / 2)} disabled={zoom <= 1} aria-label="Zoom out" title="Zoom out (-)"><Icon name="zoomOut" size={17} /></button>
          <button type="button" className="icon-btn sm" onClick={() => changeZoom(1)} disabled={zoom === 1} aria-label="Fit to width" title="Fit to width"><Icon name="fit" size={16} /></button>
          <button type="button" className="icon-btn sm" onClick={() => changeZoom(zoom * 2)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in (+)"><Icon name="zoomIn" size={17} /></button>
        </div>
      </div>

      <div className="tl-main">
        <div className="tl-labels" aria-hidden="true"><span className="tl-l0" /><span>Source</span><span>Edited</span></div>
        <div className="tl-scroll" ref={scrollRef}>
          <div className="tl-inner" ref={innerRef} style={{ width: innerW }}>
            <canvas ref={rulerRef} className="tl-ruler" aria-hidden="true" />

            <div className="tl-track src" onPointerDown={down('source')} onPointerMove={move('source')} onPointerUp={up} onPointerCancel={up} role="group" aria-label="Source video track. Click or drag to move the playhead.">
              <canvas ref={srcWaveRef} aria-hidden="true" />
              {deletedCuts.map((c) => (
                <div key={`c${c.start}`} className="tl-cut" style={{ left: c.start * pps, width: Math.max(2, (c.end - c.start) * pps) }} title={`Deleted ${formatTime(c.start)}–${formatTime(c.end)} (${(c.end - c.start).toFixed(1)}s)`} />
              ))}
              {trimmedZones.map((c) => (
                <div key={`t${c.start}`} className="tl-trimmed" style={{ left: c.start * pps, width: Math.max(2, (c.end - c.start) * pps) }} title="Trimmed away" />
              ))}
              {(['start', 'end'] as const).map((side) => {
                const t = side === 'start' ? (shownTrim?.start ?? 0) : (shownTrim?.end ?? duration);
                return (
                  <div key={side} className={`tl-handle ${side}${drag?.side === side ? ' is-drag' : ''}`} style={{ left: t * pps }}
                    role="slider" tabIndex={0} aria-label={side === 'start' ? 'Trim start' : 'Trim end'} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={Number(t.toFixed(2))} aria-valuetext={formatTime(t)}
                    onPointerDown={handleDown(side)} onPointerMove={handleMove(side)} onPointerUp={handleUp} onPointerCancel={handleUp} onKeyDown={handleKey(side)}
                    title={`${side === 'start' ? 'Trim start' : 'Trim end'} ${formatTime(t)}. Drag, or use the arrow keys.`} />
                );
              })}
              <div className="tl-head" ref={srcHeadRef} aria-hidden="true" />
            </div>

            <div className="tl-track edit" onPointerDown={down('edited')} onPointerMove={move('edited')} onPointerUp={up} onPointerCancel={up} role="group" aria-label="Edited video track. Click or drag to move the playhead.">
              <canvas ref={editWaveRef} aria-hidden="true" />
              {(() => {
                let acc = 0;
                return keep.map((k, n) => {
                  const left = acc * pps, width = (k.end - k.start) * pps;
                  acc += k.end - k.start;
                  const prev = keep[n - 1];
                  return (
                    <div key={k.start} className="tl-clipwrap" style={{ left, width }}>
                      <div className="tl-clip" title={`Clip ${n + 1}: ${formatTime(k.start)}–${formatTime(k.end)} of the source`}>{width > 90 ? `Clip ${n + 1} · ${formatTime(k.start)}–${formatTime(k.end)}` : ''}</div>
                      {prev && <i className="tl-cutmark" title={`Cut here: ${formatTime(prev.end)}–${formatTime(k.start)} removed (${(k.start - prev.end).toFixed(1)}s)`} />}
                    </div>
                  );
                });
              })()}
              {keep.length === 0 && <span className="tl-none">Nothing left in the edit</span>}
              <div className="tl-head" ref={editHeadRef} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>

      <div className="tl-foot muted">
        <span><i className="dot cut" />Deleted</span><span><i className="dot trim" />Trimmed</span><span><i className="dot wave" />Audio</span>
        <span className="tl-wave">{waveStatus === 'loading' ? 'Drawing waveform…' : waveStatus === 'unavailable' ? waveMessage : 'Click a track to jump. Arrow keys step 1 s (Shift 5 s).'}</span>
      </div>
    </section>
  );
}
