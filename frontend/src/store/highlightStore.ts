import { create } from 'zustand';
import { useEditorStore } from './editorStore';
import { fetchHighlights } from '../services/aiApi';
import type { HighlightClip } from '../services/aiApi';

export interface Clip extends HighlightClip { selected: boolean }
type Status = 'idle' | 'loading' | 'ready' | 'error';

interface HighlightState {
  min: number; max: number; count: number;
  clips: Clip[]; status: Status; error: string; warning: string; provider: string;
  setTarget(min: number, max: number): void;
  setCount(count: number): void;
  generate(projectId: string): Promise<void>;
  toggle(id: string): void;
  setAll(on: boolean): void;
  reset(): void;
}

const blank = { clips: [] as Clip[], status: 'idle' as Status, error: '', warning: '', provider: '' };
let ctl: AbortController | null = null;

export const useHighlightStore = create<HighlightState>()((set, get) => ({
  min: 30, max: 60, count: 5, ...blank,
  setTarget: (min, max) => set({ min, max }),
  setCount: (count) => set({ count }),
  async generate(projectId) {
    ctl?.abort();
    const c = new AbortController();
    ctl = c;
    const { min, max, count } = get();
    set({ status: 'loading', error: '', warning: '' });
    try {
      const r = await fetchHighlights(projectId, { min_seconds: min, max_seconds: max, count }, c.signal);
      set({
        status: 'ready', provider: r.provider, clips: r.highlights.map((h) => ({ ...h, selected: true })),
        warning: r.warning || (r.truncated ? 'The transcript is long, so only the first part was analysed.' : '')
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      set({ status: 'error', error: (e as Error).message || 'Could not generate highlights.' });
    }
  },
  toggle: (id) => set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)) })),
  setAll: (on) => set((s) => ({ clips: s.clips.map((c) => ({ ...c, selected: on })) })),
  reset() { ctl?.abort(); set({ ...blank }); }
}));

// A new transcript (or another project) invalidates old suggestions.
useEditorStore.subscribe((s, prev) => { if (s.words !== prev.words) useHighlightStore.getState().reset(); });
