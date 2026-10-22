// npm run test:ui — renders the real editor components in jsdom and clicks through Features 1–3.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TranscriptPanel from './TranscriptPanel';
import SidePanel from './SidePanel';
import Timeline from './Timeline';
import EditorTopBar from './EditorTopBar';
import VideoPreview from './VideoPreview';
import EditorPage from '../../pages/EditorPage';
import { useEditorStore } from '../../store/editorStore';
import { usePlayhead } from '../../store/playheadStore';

vi.mock('../../services/editorService', () => ({
  loadEditorProject: vi.fn(async () => ({
    projectId: 'p1', name: 'Demo project', file: null, videoUrl: 'http://localhost/v.mp4', duration: 12, origin: 'browser', saved: null, legacy: null, peaks: new Uint8Array(600).fill(120),
    transcript: [
      { start: 0, end: 4, text: 'So um today we are going to talk about editing.' },
      { start: 5, end: 9, text: 'It feels like writing a document, uh, honestly.' },
      { start: 10, end: 12, text: 'Thank you all.' }
    ]
  }))
}));
const saves: unknown[] = [];
vi.mock('../../services/editorStorage', () => ({
  saveEditState: vi.fn(async (_id: string, state: unknown) => { saves.push(state); }),
  saveTranscript: vi.fn(async () => {}), savePeaks: vi.fn(async () => {}), getSource: vi.fn(async () => undefined), putSource: vi.fn(async () => {})
}));

const segments = [
  { start: 0, end: 4, text: 'So um today we are going to talk about editing.' },
  { start: 5, end: 9, text: 'It feels like writing a document, uh, honestly.' },
  { start: 10, end: 12, text: 'Thank you all.' }
];
const st = () => useEditorStore.getState();
const word = (text: string) => screen.getByRole('button', { name: new RegExp(`^${text}`) });

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  Element.prototype.scrollIntoView = () => {};
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
  class PE extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; } }
  (globalThis as unknown as { PointerEvent: typeof PE }).PointerEvent = PE; // jsdom has no PointerEvent
  HTMLCanvasElement.prototype.getContext = (() => null) as never; // the editor must cope without canvas
});
beforeEach(() => { st().load({ segments, duration: 12 }); usePlayhead.getState().set(0); saves.length = 0; });
afterEach(() => { cleanup(); st().reset(); });

describe('Feature 1: transcript editing', () => {
  it('selects words, deletes them, shows them struck through and restores them', () => {
    render(<MemoryRouter><TranscriptPanel onSeek={() => {}} /></MemoryRouter>);
    fireEvent.mouseDown(word('um'), { button: 0 });
    fireEvent.mouseUp(document);
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    expect(screen.getByRole('button', { name: 'um (deleted)' })).toBeTruthy();
    expect(st().doc.deleted.has(1)).toBe(true);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'um (deleted)' }), { button: 0 });
    fireEvent.mouseUp(document);
    fireEvent.click(screen.getByRole('button', { name: /Restore/ }));
    expect(st().doc.deleted.size).toBe(0);
  });

  it('jumps the video when a word or a timestamp is clicked', () => {
    const seek = vi.fn();
    render(<MemoryRouter><TranscriptPanel onSeek={seek} /></MemoryRouter>);
    fireEvent.mouseDown(word('talk'), { button: 0 });
    fireEvent.mouseUp(document);
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek.mock.calls[0][0]).toBeGreaterThan(1);
    fireEvent.click(screen.getAllByTitle('Jump to this line')[1]);
    expect(seek).toHaveBeenLastCalledWith(5);
  });

  it('searches the transcript and counts matches', () => {
    render(<MemoryRouter><TranscriptPanel onSeek={() => {}} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Search the transcript'), { target: { value: 'thank' } });
    expect(screen.getByText('1 of 1')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search the transcript'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('edits a caption from the selection bar (Feature 3 records it)', () => {
    render(<MemoryRouter><TranscriptPanel onSeek={() => {}} /></MemoryRouter>);
    fireEvent.mouseDown(word('um'), { button: 0 });
    fireEvent.mouseUp(document);
    fireEvent.click(screen.getByRole('button', { name: /Edit text/ }));
    fireEvent.change(screen.getByLabelText('Caption text'), { target: { value: 'Well,' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: /^Well,/ })).toBeTruthy();
    expect(st().history[st().index].kind).toBe('caption');
  });
});

describe('Feature 3: undo / redo / history', () => {
  it('undo and redo buttons in the top bar work, and the history lists every step', () => {
    render(<MemoryRouter><EditorTopBar projectId="p1" name="Demo" /><SidePanel onSeek={() => {}} initial="history" /></MemoryRouter>);
    act(() => { st().deleteIndices([1]); st().setTrim({ start: 1, end: 11 }); st().setCrop({ aspect: '1:1', zoom: 1, panX: 0.5, panY: 0.5 }); });
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('button')).toHaveLength(4); // 3 edits + the original state
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    expect(st().doc.crop).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    expect(st().doc.trim).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Redo' })[0]);
    expect(st().doc.trim).not.toBeNull();
    const items = within(screen.getByRole('list')).getAllByRole('button'); // newest first, the last one is the original state
    fireEvent.click(items.at(-2)!); // the first edit (the cut)
    expect(st().doc.deleted.has(1)).toBe(true);
    expect(st().doc.trim).toBeNull();
    fireEvent.click(items.at(-1)!);
    expect(st().doc.deleted.size).toBe(0);
  });

  it('Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y work in the editor page and the edit state is saved', async () => {
    vi.useFakeTimers();
    render(<MemoryRouter initialEntries={['/editor/p1']}><Routes><Route path="/editor/:projectId" element={<EditorPage />} /></Routes></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    expect(screen.getByText('Demo project')).toBeTruthy();
    act(() => { st().deleteIndices([1, 2]); });
    expect(st().doc.deleted.size).toBe(2);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(st().doc.deleted.size).toBe(0);
    expect(screen.getByRole('status', { name: '' }).textContent).toMatch(/Undid/);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(st().doc.deleted.size).toBe(2);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(st().doc.deleted.size).toBe(2);
    // typing in the search box must keep the browser's own undo
    const box = screen.getByLabelText('Search the transcript');
    fireEvent.keyDown(box, { key: 'z', ctrlKey: true });
    expect(st().doc.deleted.size).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(saves.length).toBeGreaterThan(0);
    const last = saves.at(-1) as { index: number; entries: unknown[] };
    expect(last.index).toBe(st().index);
    expect(last.entries.length).toBe(st().history.length);
    vi.useRealTimers();
  });
});

describe('Feature 2: preview and timeline', () => {
  it('shows the remaining clips and a marker at every cut, and maps source time to edited time', () => {
    usePlayhead.getState().set(5);
    render(<MemoryRouter><Timeline onSeek={() => {}} peaks={null} waveStatus="unavailable" waveMessage="No audio" /></MemoryRouter>);
    expect(screen.getAllByTitle(/^Clip \d/)).toHaveLength(1);
    act(() => { st().deleteIndices([7, 8, 9]); }); // "talk about editing."
    expect(screen.getAllByTitle(/^Clip \d/)).toHaveLength(2);
    expect(screen.getAllByTitle(/^Cut here/)).toHaveLength(1);
    expect(screen.getByText('No audio')).toBeTruthy();
    expect(document.querySelector('.tl-readout')?.textContent).toMatch(/Source 0:05 → Edited 0:0[3-4]/);
  });

  it('seeks when a track is clicked, in source time or edited time', () => {
    const seek = vi.fn();
    render(<MemoryRouter><Timeline onSeek={seek} peaks={null} waveStatus="loading" waveMessage="" /></MemoryRouter>);
    act(() => { st().deleteIndices([7, 8, 9]); });
    const inner = document.querySelector('.tl-inner') as HTMLElement;
    inner.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 100, width: 600, height: 100, x: 0, y: 0, toJSON() {} });
    fireEvent.pointerDown(screen.getByRole('group', { name: /Source video track/ }), { clientX: 120, button: 0, pointerId: 1 });
    expect(seek.mock.calls.at(-1)![0]).toBeCloseTo(6, 1); // jsdom has no layout: the timeline falls back to 240 px = 12 s, so 120 px = 6 s
    fireEvent.pointerUp(screen.getByRole('group', { name: /Source video track/ }));
    const before = st().keep;
    fireEvent.pointerDown(screen.getByRole('group', { name: /Edited video track/ }), { clientX: 0, button: 0, pointerId: 1 });
    expect(seek.mock.calls.at(-1)![0]).toBeCloseTo(before[0].start, 3);
  });

  it('trims with Set start / Set end / Reset trim and with the keyboard on a handle', () => {
    render(<MemoryRouter><Timeline onSeek={() => {}} peaks={null} waveStatus="loading" waveMessage="" /></MemoryRouter>);
    act(() => usePlayhead.getState().set(2));
    fireEvent.click(screen.getByRole('button', { name: /Set start/ }));
    expect(st().doc.trim?.start).toBeCloseTo(2, 3);
    act(() => usePlayhead.getState().set(10));
    fireEvent.click(screen.getByRole('button', { name: /Set end/ }));
    expect(st().doc.trim?.end).toBeCloseTo(10, 3);
    expect(st().keep).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Trim start' }), { key: 'ArrowRight', shiftKey: true });
    expect(st().doc.trim?.start).toBeCloseTo(3, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Reset trim' }));
    expect(st().doc.trim).toBeNull();
  });

  it('player: speed, crop badge and the empty-edit message', () => {
    const ref = { current: null as HTMLVideoElement | null };
    render(<MemoryRouter><VideoPreview src="blob:x" videoRef={ref} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Playback speed'), { target: { value: '1.5' } });
    expect(ref.current!.playbackRate).toBe(1.5);
    act(() => { st().setVideoSize({ w: 1920, h: 1080 }); st().setCrop({ aspect: '9:16', zoom: 1, panX: 0.5, panY: 0.5 }); });
    expect(screen.getByText('Crop 9:16')).toBeTruthy();
    expect(ref.current!.style.objectFit).toBe('fill');
    act(() => { st().deleteIndices(st().words.map((w) => w.i)); });
    expect(screen.getByText(/Everything is deleted/)).toBeTruthy();
  });
});
