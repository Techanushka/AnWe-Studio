import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { LANGUAGES, MODELS, SERVER_MODE, isRunning } from '../../hooks/useTranscriber.js';
import { downloadText, formatTime, toPlainText, toSrt, toTimestampedText } from '../../utils/transcript.js';

// Explains WHY a transcript is empty instead of a generic "no speech" message.
function emptyReason(stats) {
  if (stats?.silent) return 'This video’s audio track is silent (or almost silent), so there is nothing to transcribe. Check that the original recording has sound.';
  if (stats && stats.chunks === 0) return 'No clear speech was found. The audio may be only background noise or music. Try a recording with a clearer voice.';
  if (stats?.speechSeconds > 0) return 'Speech was detected, but the model returned no text. Choose the spoken language yourself and use the Best in browser model, then press Transcribe again.';
  return 'We didn’t detect any speech. If the video does have talking, choose the spoken language and try again.';
}

export default function TranscriptWindow({ file, transcript, options, onOptions, onRestart, onCancel, onClose }) {
  const videoRef = useRef(null);
  const listRef = useRef(null);
  const [time, setTime] = useState(0);
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const { status, segments, error, modelProgress, uploadProgress, doneSeconds, totalSeconds, language, stats } = transcript;
  const running = isRunning(status);
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const activeIndex = segments.findIndex((s) => time >= s.start && time < Math.max(s.end, s.start + 0.5));
  const percent = totalSeconds ? Math.min(100, Math.round((doneSeconds / totalSeconds) * 100)) : 0;

  // Keep the newest line in view while the transcript is being written.
  useEffect(() => {
    if (status === 'transcribing' && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [segments.length, status]);

  function seek(segment) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = segment.start;
    video.play().catch(() => { /* autoplay blocked or unsupported codec */ });
  }
  async function copy() {
    try { await navigator.clipboard.writeText(toPlainText(segments)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }

  return (
    <Modal wide titleId="tw-title" onClose={onClose}>
      <div className="tw-head">
        <div className="tw-title">
          <h2 id="tw-title">Transcript</h2>
          <p title={file.name}>{file.name}</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close transcript window"><Icon name="x" /></button>
      </div>

      <div className="tw-body">
        <div className="tw-side">
          <video ref={videoRef} src={url} controls playsInline preload="metadata" onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} />
          <form className="tw-opts" onSubmit={(event) => { event.preventDefault(); onRestart(); }}>
            <div className="field">
              <label htmlFor="tw-lang">Spoken language</label>
              <select id="tw-lang" value={options.language} disabled={running} onChange={(e) => onOptions({ ...options, language: e.target.value })}>
                {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            {!SERVER_MODE && <div className="field">
              <label htmlFor="tw-model">Speech model</label>
              <select id="tw-model" value={options.model} disabled={running} onChange={(e) => onOptions({ ...options, model: e.target.value })}>
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>}
            <button type="submit" className="btn ghost sm" disabled={running}>Transcribe again</button>
          </form>
          <p className="tw-privacy">{SERVER_MODE
            ? 'Your video is sent to your Anwe transcription server to be transcribed with a large speech model.'
            : 'Your video stays on this device. Only the speech model is downloaded, once, and your browser keeps it for next time.'}</p>
          {language && <p className="tw-lang">Language used: <b>{language}</b>{options.language === 'auto' ? ' (detected, then kept for the whole video)' : ''}</p>}
        </div>

        <div className="tw-main">
          <div className="tw-status" role="status" aria-live="polite">
            {status === 'uploading' && (
              <>
                <p><i className="spin" aria-hidden="true" />Uploading your video… {uploadProgress}%</p>
                <div className="progress slim" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><i style={{ width: `${uploadProgress}%` }} /></div>
              </>
            )}
            {status === 'reading' && <p><i className="spin" aria-hidden="true" />Reading the audio from your video…</p>}
            {status === 'loading' && (
              <>
                <p><i className="spin" aria-hidden="true" />{modelProgress > 0 && modelProgress < 100 ? `Downloading the speech model… ${modelProgress}%` : 'Loading the speech model…'}</p>
                <div className="progress slim" role="progressbar" aria-label="Model download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={modelProgress}><i style={{ width: `${modelProgress}%` }} /></div>
              </>
            )}
            {status === 'transcribing' && (
              <>
                <p><i className="spin" aria-hidden="true" />Turning speech into text… {formatTime(doneSeconds)} of {formatTime(totalSeconds)}</p>
                <div className="progress slim" role="progressbar" aria-label="Transcription progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div>
              </>
            )}
            {status === 'done' && (segments.length
              ? <p className="ok"><Icon name="check" size={16} />Transcript ready. Select any line to jump to that moment.</p>
              : <p className="warn"><Icon name="alert" size={16} />{emptyReason(stats)}</p>)}
            {status === 'cancelled' && <p className="warn"><Icon name="alert" size={16} />Transcription cancelled.{segments.length ? ' The lines below are what was finished.' : ''}</p>}
            {status === 'error' && <p className="bad" role="alert"><Icon name="alert" size={16} />{error}</p>}
          </div>

          {segments.length > 0 ? (
            <ol className="tw-list" ref={listRef} aria-label="Transcript lines">
              {segments.map((segment, index) => (
                <li key={`${segment.start}-${index}`}>
                  <button type="button" className={`seg${index === activeIndex ? ' on' : ''}`} onClick={() => seek(segment)}>
                    <span className="ts">{formatTime(segment.start)}</span><span>{segment.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="tw-empty">{running ? 'Lines will appear here as they’re transcribed.' : 'Nothing to show yet.'}</div>
          )}
        </div>
      </div>

      <div className="tw-foot">
        <div className="tw-actions">
          <button type="button" className="btn ghost sm" onClick={copy} disabled={!segments.length}><Icon name="copy" size={15} />{copied ? 'Copied' : 'Copy text'}</button>
          <button type="button" className="btn ghost sm" onClick={() => downloadText(`${baseName}-transcript.txt`, toTimestampedText(segments))} disabled={!segments.length}><Icon name="download" size={15} />.txt</button>
          <button type="button" className="btn ghost sm" onClick={() => downloadText(`${baseName}.srt`, toSrt(segments), 'application/x-subrip')} disabled={!segments.length}><Icon name="download" size={15} />.srt captions</button>
        </div>
        {running
          ? <button type="button" className="btn ghost" onClick={onCancel}>Cancel transcription</button>
          : <button type="button" className="btn primary" onClick={onClose}>Done</button>}
      </div>
    </Modal>
  );
}
