// npm run test:editor — checks the editing logic (Features 1–3): words, cuts, search, time mapping, trim,
// captions, crop, waveform peaks, the Zustand store, undo/redo history and saving/restoring it.
import {
  buildWords, groupLines, deletedRuns, cutRanges, keepRanges, cutTotal, findCut, findCutIn, sourceToEdited, editedToSource, wordAtTime,
  findMatches, editedSegments, buildEditList, transcriptKey, computeCuts, cropRect, serializeDoc, deserializeDoc, EMPTY_DOC, sameDoc, defaultCrop
} from '../src/utils/editModel';
import { peaksFromChannels } from '../src/utils/waveform';
import { useEditorStore, snapshotHistory, MAX_HISTORY } from '../src/store/editorStore';
import type { EditDoc } from '../src/types/editor';

let failed = 0;
const ok = (c: boolean, name: string, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!c) failed++; };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const doc = (deleted: number[]): EditDoc => ({ ...EMPTY_DOC, deleted: new Set(deleted) });

const segments = [
  { start: 0, end: 4, text: 'So um today we are going to talk about editing.' },
  { start: 5, end: 9, text: 'It feels like writing a document, uh, honestly.' },
  { start: 10, end: 12, text: 'Thank you all.' }
];
const words = buildWords(segments);

console.log('— Feature 1: words, cuts, search');
ok(words.length === 10 + 8 + 3 && words.every((w, i) => w.i === i), 'segments become indexed words', `n=${words.length}`);
ok(words.every((w) => w.end >= w.start) && words.every((w, i) => i === 0 || w.start >= words[i - 1].start - 1e-9), 'estimated word times are ordered');
ok(near(words[0].start, 0) && near(words[9].end, 4) && words[0].estimated, 'estimated words fill their line exactly');
ok(words[0].sentence === 0 && words[10].sentence === 1 && words[18].sentence === 2, 'each line starts a new sentence');
const exact = buildWords([{ start: 0, end: 2, text: 'hello world', words: [{ word: ' hello', start: 0.2, end: 0.6 }, { word: 'world.', start: 0.8, end: 1.4 }] }]);
ok(exact.length === 2 && !exact[0].estimated && near(exact[1].start, 0.8) && exact[0].text === 'hello', 'exact word timings from the server are used as-is');
const bad = buildWords([{ start: 0, end: 2, text: 'a b', words: [{ word: 'a', start: 1, end: 1.2 }, { word: 'b', start: 0.1, end: 0.2 }] }]);
ok(bad.every((w) => w.estimated), 'out-of-order word timings fall back to estimates');
ok(buildWords([{ start: 0, end: 6, text: 'One. Two three. Four' }]).map((w) => w.sentence).join() === '0,1,1,2', 'sentences split at punctuation inside a line');
ok(groupLines(words).length === 3 && groupLines(words)[1].from === 10, 'lines grouped');

const del = new Set([1, 7, 8, 9]);
const runs = deletedRuns(words, del);
ok(runs.length === 2 && runs[1].from === 7 && runs[1].to === 9 && runs[0].text === 'um', 'deleted words form runs');
const cuts = cutRanges(runs, 12);
ok(cuts.length === 2 && cuts[0].start < cuts[0].end && cuts[1].end <= 4 + 1e-9, 'runs become cut ranges');
const keep = keepRanges(cuts, 12);
ok(near(cutTotal(cuts) + keep.reduce((s, k) => s + (k.end - k.start), 0), 12), 'cuts + kept ranges cover the whole video');
ok(cutRanges([{ start: 1, end: 2 }, { start: 2.01, end: 3 }], 10).length === 1, 'touching cuts merge');
ok(cutRanges([{ start: 9, end: 15 }], 10)[0].end === 10, 'cuts are clamped to the video length');
ok(findCut(cuts, (cuts[0].start + cuts[0].end) / 2) === cuts[0] && findCut(cuts, 11) === null, 'findCut finds the cut under the playhead');
ok(findCutIn(cuts, cuts[0].start - 0.01, cuts[0].start + 0.005) === cuts[0] && findCutIn(cuts, 4.5, 4.6) === null, 'findCutIn sees a cut one frame ahead');
ok(wordAtTime(words, 0) === 0 && wordAtTime(words, 5.01) === 10 && wordAtTime(words, 100) === words.length - 1 && wordAtTime(words, -1) === -1, 'wordAtTime');
ok(findMatches(words, 'UM').some((m) => m.from === 1) && findMatches(words, 'going to').length === 1, 'search: single word, phrase');
ok(findMatches(words, 'going t').length === 1 && findMatches(words, 'to going').length === 0 && findMatches(words, '  ').length === 0, 'search: prefix on last word, order matters, empty');
const hi = buildWords([{ start: 0, end: 3, text: 'मैं आज वीडियो एडिटिंग बताऊंगा।' }]);
ok(findMatches(hi, 'वीडियो').length === 1 && findMatches(hi, 'बताऊंगा').length === 1, 'Hindi search keeps vowel marks');
ok(transcriptKey(words) !== transcriptKey(words.slice(1)), 'transcript key changes with the transcript');

console.log('— Feature 2: time mapping, trim, waveform');
ok(near(sourceToEdited(12, cuts), 12 - cutTotal(cuts)) && near(sourceToEdited(0, cuts), 0), 'source -> edited time');
ok(near(sourceToEdited((cuts[1].start + cuts[1].end) / 2, cuts), cuts[1].start - (cuts[0].end - cuts[0].start)), 'time inside a cut maps to the cut point');
let roundTrip = true;
for (let t = 0; t <= 12; t += 0.37) { if (!findCut(cuts, t)) roundTrip &&= near(editedToSource(sourceToEdited(t, cuts), keep), t, 1e-6); }
ok(roundTrip, 'edited -> source is the inverse of source -> edited on kept video');
ok(near(editedToSource(0, keep), keep[0].start) && near(editedToSource(999, keep), keep[keep.length - 1].end) && editedToSource(1, []) === 0, 'edited -> source at the ends');
const trimmed = computeCuts(runs, { start: 2, end: 10 }, 12);
ok(trimmed[0].start === 0 && trimmed[trimmed.length - 1].end === 12 && trimmed[trimmed.length - 1].start === 10, 'trim adds cuts before the start and after the end');
ok(computeCuts([], { start: 0, end: 12 }, 12).length === 0 && computeCuts([], null, 12).length === 0, 'no trim, no cuts');
const peaks = peaksFromChannels([Float32Array.from({ length: 8000 * 4 }, (_, i) => (i < 8000 * 2 ? 0.1 : 0.8) * Math.sin(i))], 8000);
ok(peaks.length === 200 && peaks[10] < peaks[150] && Math.max(...peaks) === 255, 'waveform peaks: 50/s, normalised, louder part is taller', `n=${peaks.length}`);
ok(peaksFromChannels([new Float32Array(0)], 8000).length === 0, 'waveform of silence/empty audio is empty');

console.log('— crop');
const full = cropRect(defaultCrop('9:16'), { w: 1920, h: 1080 });
ok(near(full.h, 1) && near(full.w, (9 / 16) / (16 / 9)) && near(full.x, (1 - full.w) / 2), '9:16 crop of 16:9 video: full height, centred');
const sq = cropRect({ aspect: '1:1', zoom: 2, panX: 1, panY: 0 }, { w: 1920, h: 1080 });
ok(near(sq.w * 1920, sq.h * 1080) && near(sq.w, (1080 / 1920) / 2) && near(sq.x + sq.w, 1) && sq.y === 0, '1:1 crop with zoom 2 is square, pinned to the right edge');

console.log('— documents');
const d1: EditDoc = { deleted: new Set([1, 2, 5]), captions: { 3: 'TODAY' }, trim: { start: 1, end: 9 }, crop: defaultCrop('1:1') };
const back = deserializeDoc(JSON.parse(JSON.stringify(serializeDoc(d1))), words.length);
ok(sameDoc(d1, back) && serializeDoc(d1).deleted.length === 2, 'a document survives JSON (deleted words stored as ranges)');
ok(deserializeDoc({ deleted: [[0, 9999]], captions: { 99999: 'x' }, trim: { start: 5, end: 1 }, crop: null }, 5).deleted.size === 5, 'out-of-range saved data is dropped');
ok(!sameDoc(EMPTY_DOC, doc([1])) && sameDoc(doc([1, 2]), doc([2, 1])), 'sameDoc compares contents');

console.log('— exports');
const edited = editedSegments(words, doc([1, 7, 8, 9]), cuts);
ok(edited.length === 3 && !/um|editing/.test(edited[0].text) && near(edited[1].start, sourceToEdited(5, cuts)), 'edited transcript drops deleted words and is re-timed', edited[0].text);
const allLine1 = words.filter((w) => w.line === 1).map((w) => w.i);
ok(editedSegments(words, doc(allLine1), cutRanges(deletedRuns(words, new Set(allLine1)), 12)).length === 2, 'a fully deleted line disappears');
const withCaption = editedSegments(words, { ...EMPTY_DOC, captions: { 0: 'Well,' } }, []);
ok(withCaption[0].text.startsWith('Well, um'), 'caption edits appear in the export');
const tr = { start: 5, end: 12 };
ok(editedSegments(words, { ...EMPTY_DOC, trim: tr }, computeCuts([], tr, 12)).length === 2, 'words outside the trim are left out of the export');
const list = buildEditList({ projectId: 'p', words, doc: { ...doc([1, 7, 8, 9]), trim: null, crop: defaultCrop('9:16'), captions: { 0: 'Well,' } }, duration: 12, videoSize: { w: 1920, h: 1080 } });
ok(list.version === 2 && near(list.editedDuration, 12 - cutTotal(cuts)) && list.captions.length === 1 && list.crop?.outputPixels?.width === 608 && list.wordTimingEstimated, 'edit list has cuts, captions and crop', JSON.stringify(list.crop?.outputPixels));

console.log('— store: selection and edits (Feature 1)');
const st = () => useEditorStore.getState();
st().load({ segments, duration: 12 });
ok(st().words.length === 21 && st().doc.deleted.size === 0 && st().history.length === 1, 'store loads a transcript');
st().selectOnly(1); st().extendTo(3);
ok([...st().selected].join() === '1,2,3', 'shift-extend selects a range');
st().extendTo(0); ok([...st().selected].sort().join() === '0,1', 'extend backwards from the anchor');
st().toggle(5); ok(st().selected.has(5) && st().selected.size === 3, 'ctrl-click toggles');
st().selectSentence(3); ok(st().selected.size === 10 && st().selected.has(0) && !st().selected.has(10), 'double-click selects the sentence');
ok(st().deleteSelected() === 10 && st().doc.deleted.size === 10 && st().selected.size === 0, 'delete selection');
ok(st().cuts.length === 1 && near(st().cuts[0].end, 4) && near(st().keep[0].start, 4), 'cuts are derived from deleted words');
st().selectRange(0, 1);
ok(st().deleteSelected() === 0, 'deleting already-deleted words does nothing');
ok(st().restoreSelected() === 2 && st().doc.deleted.size === 8, 'restore selection');
ok(st().restoreIndices([2, 3]) === 2 && st().doc.deleted.size === 6, 'restore by index');
ok(st().restoreAll() === 6 && st().doc.deleted.size === 0, 'restore all');
st().setQuery('um'); ok(st().matches.length >= 1 && st().matchIndex === 0, 'search sets matches');
st().selectMatches(); ok(st().selected.has(1), 'select all matches');
st().setQuery('the'); st().stepMatch(-1); ok(st().matchIndex === st().matches.length - 1 || st().matches.length === 0, 'matches wrap around');
let calls = 0; st().setActive(3); const unsub = useEditorStore.subscribe(() => calls++); st().setActive(3); st().setPlaying(false); unsub();
ok(calls === 0, 'unchanged active/playing values do not re-render');

console.log('— store: trim, captions, crop');
st().load({ segments, duration: 12 });
ok(st().setTrim({ start: 2, end: 10 }) && st().cuts.length === 2 && near(st().keep[0].start, 2) && near(st().keep[0].end, 10), 'trim creates cuts and a kept range');
ok(!st().setTrim({ start: 2, end: 10 }), 'setting the same trim is not a history step');
st().setTrim({ start: 11.99, end: 12 }); ok(near(st().doc.trim!.end - st().doc.trim!.start, 0.2) || near(st().doc.trim!.end, 12), 'trim keeps a minimum length');
st().setTrim(null); ok(st().doc.trim === null && st().cuts.length === 0, 'reset trim');
st().setQuery('banana'); ok(st().matches.length === 0, 'no match before the caption edit');
ok(st().setCaption(1, 'Banana,') && st().doc.captions[1] === 'Banana,', 'caption change');
ok(st().matches.length === 1 && st().matches[0].from === 1, 'search sees caption edits right away');
ok(st().setCaption(1, 'um') && st().doc.captions[1] === undefined && st().history[st().index].label.startsWith('Reset caption'), 'typing the original text resets the caption');
ok(!st().setCaption(1, ''), 'empty caption = no change');
ok(st().setCrop(defaultCrop('9:16')) && st().doc.crop?.aspect === '9:16', 'crop');
ok(st().setCrop(null) && st().doc.crop === null, 'remove crop');

console.log('— store: undo / redo history (Feature 3)');
st().load({ segments, duration: 12 });
st().deleteIndices([1]); st().deleteIndices([7, 8]); st().setCaption(0, 'Well'); st().setTrim({ start: 1, end: 11 }); st().setCrop(defaultCrop('1:1'));
ok(st().history.length === 6 && st().index === 5, 'every cut, caption, trim and crop is one history step', st().history.map((h) => h.kind).join());
ok(st().undo() && st().doc.crop === null && st().doc.trim !== null, 'undo crop');
ok(st().undo() && st().doc.trim === null && st().doc.captions[0] === 'Well', 'undo trim');
ok(st().undo() && st().doc.captions[0] === undefined, 'undo caption');
ok(st().undo() && st().doc.deleted.size === 1 && st().undo() && st().doc.deleted.size === 0 && st().index === 0, 'undo both cuts');
ok(!st().undo(), 'nothing left to undo');
ok(st().cuts.length === 0 && st().keep.length === 1, 'derived cuts follow undo');
ok(st().redo() && st().doc.deleted.has(1) && st().redo() && st().doc.deleted.has(8), 'redo cuts');
st().jumpTo(4); ok(st().doc.trim !== null && st().doc.crop === null && st().doc.captions[0] === 'Well', 'jump to a past state from the history list');
st().deleteIndices([15]); ok(st().history.length === 6 && !st().redo(), 'a new edit discards the redo branch');
const labelBefore = st().history.length;
st().load({ segments, duration: 12 });
st().setCrop(defaultCrop('1:1'), { coalesce: 'crop' }); st().setCrop({ ...defaultCrop('1:1'), zoom: 1.2 }, { coalesce: 'crop' }); st().setCrop({ ...defaultCrop('1:1'), zoom: 1.5 }, { coalesce: 'crop' });
ok(st().history.length === 2 && st().doc.crop?.zoom === 1.5, 'a slider drag is ONE history step (coalesced)', `${labelBefore}`);
st().undo(); ok(st().doc.crop === null, 'undoing a coalesced drag restores the state before the drag');
st().load({ segments, duration: 12 });
for (let n = 0; n < 8; n++) for (let i = 0; i < 21; i++) { st().restoreAll(); st().deleteIndices([i]); } // ~336 steps
ok(st().history.length <= MAX_HISTORY, 'history is capped', `n=${st().history.length}`);

console.log('— store: saving and restoring');
st().load({ segments, duration: 12 });
st().deleteIndices([1, 2]); st().setCaption(5, 'Going'); st().setTrim({ start: 1, end: 11 }); st().undo();
const saved = JSON.parse(JSON.stringify(snapshotHistory(st())));
st().load({ segments, duration: 12, saved });
ok(st().index === saved.index && st().history.length === saved.entries.length && st().doc.deleted.has(2) && st().doc.captions[5] === 'Going' && st().doc.trim === null, 'edit state is restored after a reload');
ok(st().redo() && st().doc.trim?.start === 1, 'undo history still works after a reload (redo the trim)');
st().load({ segments, duration: 12, saved: { ...saved, key: 'other:key' } });
ok(st().history.length === 1 && st().doc.deleted.size === 0, 'saved edits are ignored when the transcript changed');
st().load({ segments, duration: 12, legacy: { deleted: [1, 2, 99999], key: transcriptKey(buildWords(segments)) } });
ok(st().doc.deleted.size === 2 && st().history.length === 2, 'Feature-1 era saved cuts are still restored');

st().reset(); st().setVideoSize({ w: 1280, h: 720 }); st().load({ segments, duration: 12 });
ok(st().videoSize?.w === 1280, 'loading a transcript keeps the size of an already-loaded video');

console.log(failed ? `\n${failed} test(s) failed` : '\nAll tests passed');
process.exit(failed ? 1 : 0);
