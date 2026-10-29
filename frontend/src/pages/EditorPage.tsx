import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/dashboard/Icon.jsx';
import EditorTopBar from '../components/editor/EditorTopBar';
import TranscriptPanel from '../components/editor/TranscriptPanel';
import VideoPreview from '../components/editor/VideoPreview';
import Timeline from '../components/editor/Timeline';
import SidePanel from '../components/editor/SidePanel';
import TranscribeGate from '../components/editor/TranscribeGate';
import { snapshotHistory, useEditorStore } from '../store/editorStore';
import { usePlayhead } from '../store/playheadStore';
import { loadEditorProject } from '../services/editorService';
import { saveEditState, saveTranscript } from '../services/editorStorage';
import { useWaveform } from '../hooks/useWaveform';
import type { LoadedProject, Segment } from '../types/editor';

const lastEnd = (segments: Segment[]) => segments.reduce((m, s) => Math.max(m, s.end || 0), 0);

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; project: LoadedProject };

/** Editor (/editor/:projectId): Feature 1 transcript editing, Feature 2 preview + timeline, Feature 3 undo/redo history. */
export default function EditorPage() {
  const { projectId = '' } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [src, setSrc] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hasTranscript = useEditorStore((s) => s.words.length > 0);
  const toast = useEditorStore((s) => s.toast);
  const panel = params.get('panel');

  const project = state.status === 'ready' ? state.project : null;
  const wave = useWaveform(projectId, project?.file ?? null, project?.videoUrl ?? '', project?.peaks ?? null);

  useEffect(() => { document.title = 'Editor – Anwe Studio'; }, []);

  // Load the project (video + transcript + saved edits and history).
  useEffect(() => {
    let alive = true;
    const store = useEditorStore.getState();
    store.reset();
    usePlayhead.getState().set(0);
    setState({ status: 'loading' });
    loadEditorProject(projectId).then((p) => {
      if (!alive) return;
      if (p.transcript) store.load({ segments: p.transcript, duration: p.duration ?? lastEnd(p.transcript), saved: p.saved, legacy: p.legacy });
      setState({ status: 'ready', project: p });
    }).catch((error: Error) => alive && setState({ status: 'error', message: error.message || 'We couldn’t open this project.' }));
    return () => { alive = false; useEditorStore.getState().reset(); };
  }, [projectId]);

  // Object URL for a local file (created in an effect so React StrictMode can't revoke it early).
  useEffect(() => {
    if (!project) { setSrc(''); return undefined; }
    if (!project.file) { setSrc(project.videoUrl); return undefined; }
    const url = URL.createObjectURL(project.file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [project]);

  // Feature 3: save the edits and the undo history (debounced) so a reload restores them.
  const ready = state.status === 'ready';
  useEffect(() => {
    if (!ready) return undefined;
    let timer = 0;
    let dirty = false;
    const flush = () => {
      clearTimeout(timer);
      if (!dirty) return;
      dirty = false;
      const s = useEditorStore.getState();
      if (s.words.length) saveEditState(projectId, snapshotHistory(s)).catch(() => {});
    };
    const unsubscribe = useEditorStore.subscribe((s, prev) => {
      if ((s.history === prev.history && s.index === prev.index) || !s.words.length) return;
      dirty = true;
      clearTimeout(timer);
      timer = window.setTimeout(flush, 400);
    });
    window.addEventListener('pagehide', flush);
    return () => { unsubscribe(); window.removeEventListener('pagehide', flush); flush(); };
  }, [ready, projectId]);

  // Feature 3: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo (left alone while typing in a text box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement;
      const type = (el as HTMLInputElement).type;
      const typing = el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(type));
      if (typing) return;
      const k = e.key.toLowerCase();
      const s = useEditorStore.getState();
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); }
      else if (k === 'y') { e.preventDefault(); s.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Short on-screen message for each undo/redo/delete.
  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => useEditorStore.setState((s) => (s.toast?.id === toast.id ? { toast: null } : s)), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => { if (ready && panel === 'timeline') timelineRef.current?.scrollIntoView({ block: 'center' }); }, [ready, panel]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (v && Number.isFinite(t)) v.currentTime = Math.max(0, t);
  }, []);

  const onTranscribed = useCallback((segments: Segment[]) => {
    saveTranscript(projectId, segments).catch(() => {});
    const duration = project?.duration ?? lastEnd(segments);
    useEditorStore.getState().load({ segments, duration: Math.max(duration, useEditorStore.getState().duration) });
  }, [projectId, project]);

  if (state.status === 'loading') {
    return <div className="db db-boot" role="status" aria-live="polite"><i className="spin big" aria-hidden="true" /><span>Opening the editor…</span></div>;
  }
  if (state.status === 'error') {
    return (
      <div className="db db-boot">
        <span className="empty-icon"><Icon name="alert" size={26} /></span>
        <p role="alert" className="ed-fail">{state.message}</p>
        <Link to="/dashboard" className="btn primary">Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="db ed">
      <EditorTopBar projectId={projectId} name={state.project.name} />
      <div className="ed-body">
        {hasTranscript
          ? <TranscriptPanel onSeek={seek} />
          : <section className="ed-left card"><TranscribeGate file={state.project.file} onDone={onTranscribed} /></section>}
        <aside className="ed-right">
          <VideoPreview src={src} videoRef={videoRef} />
          {hasTranscript && (
            <SidePanel
              onSeek={seek}
              initial={panel === 'history' ? 'history' : 'cuts'}
              projectId={projectId} /* [AI] new prop */
              name={state.project.name} /* [AI] new prop */
              source={{ file: state.project.file, url: state.project.videoUrl }} /* [AI] new prop: where the exporter reads the video from */
            />
          )}
        </aside>
        <div className="ed-bottom" ref={timelineRef}>
          <Timeline onSeek={seek} peaks={wave.peaks} waveStatus={wave.status} waveMessage={wave.message} />
        </div>
      </div>
      {toast && <div className="ed-toast" role="status" aria-live="polite">{toast.text}</div>}
    </div>
  );
}
