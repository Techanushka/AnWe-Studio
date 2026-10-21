/** Cleans Whisper output: removes invented text, repetition loops and duplicates. */
const NON_SPEECH = /^[\s[(♪*_-]*(?:blank[_ ]audio|music|applause|silence|noise|inaudible)?[\s\])♪*_.-]*$/i;
const NEVER_SPEECH = /(amara\.org|subtitles?\s+by|captions?\s+by|transcribed\s+by|translated\s+by|www\.[a-z0-9-]+\.)/i;
const SHORT_GHOSTS = /^(?:thank you\.?|thanks\.?|bye\.?|you\.?|okay\.?|\.+)$/i;
const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

export function hasRepetitionLoop(text) {
  const w = norm(text).split(' ').filter(Boolean);
  if (w.length < 8) return false;
  if (new Set(w).size / w.length < 0.3) return true;
  for (let n = 1; n <= 4; n++) {
    let run = 1;
    for (let i = n; i + n <= w.length; i += n) {
      let same = true;
      for (let k = 0; k < n; k++) if (w[i + k] !== w[i - n + k]) { same = false; break; }
      run = same ? run + 1 : 1;
      if (run >= (n === 1 ? 5 : 4)) return true;
    }
  }
  return false;
}

/** Collapses "and and and and" / "I think I think I think I think" to at most two repeats. */
export function collapseRepeats(text) {
  let words = text.split(/\s+/).filter(Boolean);
  for (let n = 4; n >= 1; n--) {
    const out = [];
    let i = 0;
    while (i < words.length) {
      out.push(words[i]);
      if (i + 2 * n <= words.length && n > 0 && out.length >= n) {
        const unit = words.slice(i - n + 1, i + 1).map(norm).join(' ');
        let reps = 0, j = i + 1;
        while (j + n <= words.length && words.slice(j, j + n).map(norm).join(' ') === unit) { reps++; j += n; }
        if (reps >= 2) { for (let k = 0; k < n; k++) out.push(words[i + 1 + k]); i = j; continue; }
      }
      i++;
    }
    words = out;
  }
  return words.join(' ');
}

/** `segments` are relative to one audio chunk of `chunkLen` seconds. */
export function cleanChunkSegments(segments, chunkLen) {
  const kept = [];
  for (const s of segments) {
    const text = (s.text || '').trim();
    if (!text || NON_SPEECH.test(text) || NEVER_SPEECH.test(text)) continue;
    if (segments.length === 1 && chunkLen < 3 && SHORT_GHOSTS.test(text)) continue;
    kept.push({ ...s, text: collapseRepeats(text) });
  }
  return kept;
}

export function dedupeConsecutive(segments) {
  const out = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && norm(prev.text) === norm(s.text) && norm(s.text).split(' ').length > 3) continue;
    out.push(s);
  }
  return out;
}
