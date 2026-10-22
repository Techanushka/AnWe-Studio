import { useEffect, useRef, useState } from 'react';
import Icon from '../dashboard/Icon.jsx';
import useTranscriber, { DEFAULT_OPTIONS, LANGUAGES, SERVER_MODE, isRunning } from '../../hooks/useTranscriber.js';
import { statusLabel } from '../../utils/transcript.js';
import type { Segment } from '../../types/editor';

/** Shown when a project has a video but no transcript yet (e.g. transcription was cancelled). */
export default function TranscribeGate({ file, onDone }: { file: File | null; onDone: (segments: Segment[]) => void }) {
  const transcript = useTranscriber();
  const [language, setLanguage] = useState('auto');
  const delivered = useRef(false);
  const running = isRunning(transcript.status);

  useEffect(() => {
    if (transcript.status === 'done' && transcript.segments.length && !delivered.current) {
      delivered.current = true;
      onDone(transcript.segments as Segment[]);
    }
  }, [transcript.status, transcript.segments, onDone]);

  return (
    <div className="ed-gate">
      <span className="empty-icon"><Icon name="text" size={26} /></span>
      <h2>This video has no transcript yet</h2>
      <p className="muted">Transcribe it to start editing by text.{SERVER_MODE ? '' : ' It runs on your device; the first run downloads the speech model.'}</p>
      {file ? (
        <>
          <div className="field">
            <label htmlFor="gate-lang">Spoken language</label>
            <select id="gate-lang" value={language} disabled={running} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          <div className="ed-gate-actions">
            {running
              ? <button type="button" className="btn ghost" onClick={transcript.cancel}>Cancel</button>
              : <button type="button" className="btn primary" onClick={() => { delivered.current = false; void transcript.start(file, { ...DEFAULT_OPTIONS, language }); }}>Transcribe this video</button>}
            <span className={`tr-state ${transcript.status}`}>{running && <i className="spin" aria-hidden="true" />}{statusLabel(transcript)}</span>
          </div>
          {transcript.status === 'error' && <p className="msg bad" role="alert"><Icon name="alert" size={16} />{transcript.error}</p>}
          {transcript.status === 'done' && !transcript.segments.length && <p className="msg bad" role="alert"><Icon name="alert" size={16} />No speech was found in this video.</p>}
        </>
      ) : <p className="msg bad"><Icon name="alert" size={16} />The server has no transcript for this project, and the video isn’t stored in this browser, so it can’t be transcribed here.</p>}
    </div>
  );
}
