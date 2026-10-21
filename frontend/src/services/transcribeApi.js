/**
 * Server-side transcription (best accuracy). Used when VITE_TRANSCRIBE_URL is set; see /backend.
 * One POST uploads the video; the server streams back newline-delimited JSON:
 *   {type:'info',duration,language,languageProbability} {type:'segment',start,end,text,words} {type:'done'} {type:'error',message}
 */
export const TRANSCRIBE_URL = (import.meta.env.VITE_TRANSCRIBE_URL || '').replace(/\/$/, '');

export function transcribeOnServer(file, { language, onUpload, onInfo, onSegment, onDone, onError }) {
  const xhr = new XMLHttpRequest();
  let read = 0;
  let finished = false;
  const done = () => { if (!finished) { finished = true; onDone(); } };
  const fail = (m) => { if (!finished) { finished = true; onError(m); } };

  const pump = (final) => {
    const text = xhr.responseText;
    const end = final ? text.length : text.lastIndexOf('\n') + 1;
    if (end <= read) return;
    const lines = text.slice(read, end).split('\n');
    read = end;
    for (const line of lines) {
      if (!line.trim()) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'info') onInfo(m);
      else if (m.type === 'segment') onSegment(m);
      else if (m.type === 'error') fail(m.message || 'The transcription server failed.');
      else if (m.type === 'done') done();
    }
  };

  xhr.open('POST', `${TRANSCRIBE_URL}/transcribe`);
  xhr.upload.onprogress = (e) => e.lengthComputable && onUpload(Math.round((e.loaded / e.total) * 100));
  xhr.upload.onload = () => onUpload(100);
  xhr.onprogress = () => pump(false);
  xhr.onerror = () => fail('We couldn’t reach the transcription server. Check that it is running and that VITE_TRANSCRIBE_URL is correct.');
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) { pump(true); done(); return; }
    let detail = '';
    try { detail = JSON.parse(xhr.responseText).detail; } catch { /* not JSON */ }
    fail(typeof detail === 'string' && detail ? detail : `The transcription server returned an error (${xhr.status}).`);
  };

  const form = new FormData();
  form.append('file', file);
  form.append('language', language || 'auto');
  xhr.send(form);
  return { abort: () => { finished = true; xhr.abort(); } };
}
