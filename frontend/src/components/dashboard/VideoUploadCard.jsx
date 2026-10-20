import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import TranscriptWindow from './TranscriptWindow.jsx';
import { useDashboard } from './dashboardContext.js';
import useTranscriber, { DEFAULT_OPTIONS, isRunning } from '../../hooks/useTranscriber.js';
import { projectService, projectErrorMessage } from '../../services/projectService.js';
import { formatBytes, formatDuration } from '../../utils/format.js';
import { statusLabel } from '../../utils/transcript.js';

const EXTENSIONS = ['mp4', 'mov', 'webm'];
const ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';
const MAX_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 2048;
const MAX_BYTES = MAX_MB * 1024 * 1024;

function validateVideo(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!EXTENSIONS.includes(ext) || (file.type && !file.type.startsWith('video/'))) {
    return `“${file.name}” isn’t a supported format. Upload an MP4, MOV or WebM video.`;
  }
  if (file.size === 0) return 'That file is empty. Choose a different video.';
  if (file.size > MAX_BYTES) return `That video is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`;
  return '';
}

export default function VideoUploadCard() {
  const navigate = useNavigate();
  const { previewMode, notify } = useDashboard();
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const redirectRef = useRef(0);
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | selected | invalid | uploading | success | error
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [duration, setDuration] = useState(null);
  const transcript = useTranscriber();
  const [showTranscript, setShowTranscript] = useState(false);
  const [tOptions, setTOptions] = useState(DEFAULT_OPTIONS);

  useEffect(() => () => { clearTimeout(redirectRef.current); abortRef.current?.abort(); }, []);

  // Read duration from the file's metadata (best effort: some codecs can't be read by the browser).
  useEffect(() => {
    setDuration(null);
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => setDuration(Number.isFinite(probe.duration) ? probe.duration : null);
    probe.src = url;
    return () => { probe.removeAttribute('src'); probe.load(); URL.revokeObjectURL(url); };
  }, [file]);

  function choose(list) {
    const picked = list?.[0];
    if (!picked) return;
    const problem = validateVideo(picked);
    setProgress(0);
    if (problem) { setFile(null); setPhase('invalid'); setMessage(problem); return; }
    setFile(picked); setPhase('selected');
    // Speech-to-text starts right away and its window opens.
    transcript.start(picked, tOptions); setShowTranscript(true);
    setMessage(list.length > 1 ? 'Only one video per project. Using the first one you chose.' : '');
  }

  function remove() {
    transcript.reset(); setShowTranscript(false);
    setFile(null); setPhase('idle'); setMessage(''); setProgress(0);
  }

  async function submit() {
    if (!file || phase === 'uploading') return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('uploading'); setProgress(0); setMessage('');
    try {
      const project = await projectService.createProject(file, { duration, signal: controller.signal, onProgress: setProgress, transcript: transcript.status === 'done' ? transcript.segments : null });
      setProgress(100); setPhase('success');
      notify(previewMode ? 'Local draft created. Nothing was uploaded.' : 'Project created.');
      redirectRef.current = setTimeout(() => navigate(`/editor/${encodeURIComponent(project.projectId)}`), 700);
    } catch (error) {
      if (error?.name === 'AbortError') { setPhase('selected'); setProgress(0); return; }
      setPhase('error'); setMessage(projectErrorMessage(error));
    }
  }

  const busy = phase === 'uploading' || phase === 'success';
  const transcribing = isRunning(transcript.status);

  return (
    <section className="card upload" aria-labelledby="upload-title">
      <h2 id="upload-title">Start a new project</h2>
      <p className="card-sub">Upload a recording and we’ll set up a project you can edit by editing text.</p>

      {previewMode && (
        <p className="dev-note"><Icon name="alert" size={15} /><span><b>Development fallback.</b> With no backend connected, this only creates a local draft in your browser. Your video isn’t uploaded or transcribed.</span></p>
      )}

      <input ref={inputRef} type="file" accept={ACCEPT} hidden tabIndex={-1}
        onChange={(event) => { choose([...event.target.files]); event.target.value = ''; }} />

      {!file ? (
        <div className={`drop${dragging ? ' is-over' : ''}${phase === 'invalid' ? ' is-invalid' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); choose([...event.dataTransfer.files]); }}>
          <span className="drop-icon"><Icon name="upload" size={26} /></span>
          <p className="drop-title">Drop your video here</p>
          <p className="drop-sub">or browse files from your device.</p>
          <button type="button" className="btn ghost" onClick={() => inputRef.current.click()}>Browse files</button>
          <p className="drop-hint">MP4, MOV or WebM, up to {formatBytes(MAX_BYTES)}</p>
        </div>
      ) : (
        <div className="picked">
          <div className="picked-row">
            <span className="file-icon"><Icon name="film" size={22} /></span>
            <div className="file-meta">
              <b title={file.name}>{file.name}</b>
              <span>{formatBytes(file.size)}{duration != null ? `, ${formatDuration(duration)} long` : ''}</span>
            </div>
            <button type="button" className="icon-btn" onClick={remove} disabled={busy} aria-label={`Remove ${file.name}`}><Icon name="x" /></button>
          </div>
          {transcript.status !== 'idle' && (
            <div className="tr-row">
              <span className={`tr-state ${transcript.status}`}>{transcribing && <i className="spin" aria-hidden="true" />}{statusLabel(transcript)}</span>
              <button type="button" className="btn ghost sm" onClick={() => setShowTranscript(true)}>View transcript</button>
            </div>
          )}
          {phase === 'uploading' && !previewMode && (
            <div className="progress" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <i style={{ width: `${progress}%` }} /><span>{progress}%</span>
            </div>
          )}
          {phase === 'uploading' && previewMode && <p className="status"><i className="spin" aria-hidden="true" />Saving local draft…</p>}
          {phase === 'success' && <p className="status ok"><Icon name="check" size={16} />{previewMode ? 'Local draft created. Opening the editor page…' : 'Project created. Opening the editor…'}</p>}
        </div>
      )}

      {message && (phase === 'invalid' || phase === 'error' || phase === 'selected') && (
        <p className={`msg ${phase === 'selected' ? 'info' : 'bad'}`} role="alert"><Icon name="alert" size={16} />{message}</p>
      )}

      {file && (
        <div className="upload-actions">
          <button type="button" className="btn primary" onClick={submit} disabled={busy || transcribing} title={transcribing ? 'Finishing the transcript first' : undefined}>
            {phase === 'uploading' && <i className="spin" aria-hidden="true" />}
            {phase === 'uploading' ? (previewMode ? 'Saving…' : 'Uploading…') : phase === 'error' ? 'Try again' : previewMode ? 'Create local draft' : 'Create project'}
          </button>
          {phase === 'uploading' && !previewMode && <button type="button" className="btn ghost" onClick={() => abortRef.current?.abort()}>Cancel upload</button>}
        </div>
      )}
      {showTranscript && file && (
        <TranscriptWindow file={file} transcript={transcript} options={tOptions} onOptions={setTOptions}
          onRestart={() => transcript.start(file, tOptions)} onCancel={transcript.cancel} onClose={() => setShowTranscript(false)} />
      )}
    </section>
  );
}
