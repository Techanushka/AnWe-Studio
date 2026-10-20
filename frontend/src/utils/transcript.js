export function formatTime(seconds) {
  const t = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

const pad = (n, len = 2) => String(n).padStart(len, '0');
function srtTime(seconds) {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))},${pad(ms % 1000, 3)}`;
}

export const toPlainText = (segments) => segments.map((s) => s.text).join(' ');
export const toTimestampedText = (segments) => segments.map((s) => `[${formatTime(s.start)}] ${s.text}`).join('\n');
export const toSrt = (segments) => segments
  .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(Math.max(s.end, s.start + 0.5))}\n${s.text}\n`)
  .join('\n');

export function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function statusLabel(t) {
  switch (t.status) {
    case 'reading': return 'Reading audio…';
    case 'loading': return 'Loading speech model…';
    case 'transcribing': return `Transcribing… ${t.totalSeconds ? Math.min(99, Math.round((t.doneSeconds / t.totalSeconds) * 100)) : 0}%`;
    case 'done': return t.segments.length ? `Transcript ready, ${t.segments.length} lines` : 'No speech found';
    case 'error': return 'Transcription failed';
    case 'cancelled': return 'Transcription cancelled';
    default: return '';
  }
}
