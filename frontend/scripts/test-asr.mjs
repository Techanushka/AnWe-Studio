// Run with:  npm run test:asr   (no model or browser needed – tests the audio/VAD/cleanup logic)
import { normalizeAudio } from '../src/utils/asr/normalize.js';
import { detectSpeechChunks, RATE } from '../src/utils/asr/vad.js';
import { guessLanguage } from '../src/utils/asr/language.js';
import { cleanChunkSegments, collapseRepeats, dedupeConsecutive, hasRepetitionLoop } from '../src/utils/asr/postprocess.js';

let failed = 0;
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) failed++; };

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
/** Speech-like audio: syllable-rate amplitude modulation over harmonics, plus a noise floor. */
function synth(parts, noise = 0.0003) {
  const total = parts.reduce((s, p) => s + p.dur, 0);
  const a = new Float32Array(Math.round(total * RATE));
  let t0 = 0;
  for (const p of parts) {
    const n = Math.round(p.dur * RATE), o = Math.round(t0 * RATE);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      let v = rnd() * 2 * noise;
      if (p.amp) {
        const env = Math.pow(Math.abs(Math.sin(Math.PI * 3.7 * t)), 1.5) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.4 * t) ** 2);
        v += p.amp * env * (Math.sin(2 * Math.PI * 180 * t) + 0.6 * Math.sin(2 * Math.PI * 540 * t) + 0.4 * Math.sin(2 * Math.PI * 1500 * t) + 0.3 * rnd());
      }
      a[o + i] = v;
    }
    t0 += p.dur;
  }
  return a;
}
const speech = (dur, amp = 0.2) => ({ dur, amp });
const quiet = (dur) => ({ dur, amp: 0 });

// 1. Quiet recording: the old fixed gate (RMS < 0.004) would have skipped all of it.
{
  const a = synth([quiet(1), speech(6, 0.004), quiet(1), speech(5, 0.004), quiet(1)], 0.00005);
  let sum = 0; for (let i = 0; i < a.length; i += 16) sum += a[i] * a[i];
  const rmsBefore = Math.sqrt(sum / (a.length / 16));
  const { silent, gainDb } = normalizeAudio(a);
  const chunks = detectSpeechChunks(a);
  ok(rmsBefore < 0.004, 'quiet clip is below the old 0.004 gate', `rms=${rmsBefore.toFixed(4)}`);
  ok(!silent && gainDb > 10 && chunks.length >= 1, 'quiet speech is boosted and detected', `gain=${gainDb.toFixed(1)}dB chunks=${chunks.length}`);
  ok(chunks[0].start < 1.6 && chunks[chunks.length - 1].end > 12, 'chunks cover the whole speech', JSON.stringify(chunks.map((c) => [+c.start.toFixed(1), +c.end.toFixed(1)])));
}
// 2. 75 s of continuous speech is split into pieces of <= ~28.5 s at the quietest points.
{
  const a = synth([speech(75, 0.2)]);
  normalizeAudio(a);
  const chunks = detectSpeechChunks(a);
  const contiguous = chunks.every((c, i) => i === 0 || Math.abs(c.start - chunks[i - 1].end) < 0.05);
  ok(chunks.length >= 3 && chunks.every((c) => c.end - c.start <= 28.6), 'long speech split into <=28.5 s chunks', `n=${chunks.length}`);
  ok(contiguous && chunks[0].start < 0.5 && chunks[chunks.length - 1].end > 74, 'no gaps between split chunks');
}
// 3. A long silence starts a new chunk and the silence is skipped.
{
  const a = synth([speech(10), quiet(8), speech(10)]);
  normalizeAudio(a);
  const chunks = detectSpeechChunks(a);
  ok(chunks.length === 2 && chunks[0].end < 11 && chunks[1].start > 17, '8 s silence is skipped', JSON.stringify(chunks.map((c) => [+c.start.toFixed(1), +c.end.toFixed(1)])));
}
// 4. Short pauses stay inside one chunk (more context for the model).
{
  const a = synth([speech(4), quiet(0.8), speech(4), quiet(0.8), speech(4)]);
  normalizeAudio(a);
  ok(detectSpeechChunks(a).length === 1, 'short pauses stay in one chunk');
}
// 5. Digital silence and steady noise produce no chunks (no invented text).
{
  const z = new Float32Array(RATE * 20);
  ok(normalizeAudio(z).silent && detectSpeechChunks(z).length === 0, 'digital silence -> no speech');
  const n = new Float32Array(RATE * 30); for (let i = 0; i < n.length; i++) n[i] = rnd() * 0.05;
  normalizeAudio(n);
  ok(detectSpeechChunks(n).length === 0, 'steady noise -> no speech');
}
// 6. Speech over steady background noise is still found.
{
  const a = synth([speech(6, 0.15), quiet(3), speech(6, 0.15)], 0.02);
  normalizeAudio(a);
  ok(detectSpeechChunks(a).length >= 1, 'speech over noisy background is detected');
}
// 7. Text clean-up
ok(hasRepetitionLoop('and then and then and then and then and then we left'), 'detects repetition loop');
ok(!hasRepetitionLoop('we went to the market and then we bought some vegetables for dinner'), 'normal sentence is not a loop');
ok(collapseRepeats('so so so so so we go go go go home') === 'so so we go go home', 'collapses long repeats', collapseRepeats('so so so so so we go go go go home'));
ok(cleanChunkSegments([{ text: '[BLANK_AUDIO]' }, { text: 'Subtitles by the Amara.org community' }, { text: 'Hello there' }], 10).length === 1, 'drops invented/non-speech lines');
ok(cleanChunkSegments([{ text: 'Thank you.' }], 2).length === 0, 'drops lone "Thank you." on a 2 s chunk');
ok(cleanChunkSegments([{ text: 'Thank you.' }], 12).length === 1, 'keeps "Thank you." in a real chunk');
ok(dedupeConsecutive([{ text: 'this is a repeated line' }, { text: 'This is a repeated line.' }, { text: 'next' }]).length === 2, 'removes duplicate consecutive lines');
// 8. Language guess
ok(guessLanguage('मैं आज आपको बताना चाहता हूँ कि वीडियो एडिटिंग कैसे काम करती है') === 'hindi', 'detects Hindi script');
ok(guessLanguage('So today we are going to talk about how the editing works and what you can do') === 'english', 'detects English');
ok(guessLanguage('Hoy vamos a hablar de cómo funciona la edición y lo que es posible para los usuarios') === 'spanish', 'detects Spanish');
ok(guessLanguage('ok') === null, 'too little text -> no guess');

console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
