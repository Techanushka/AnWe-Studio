import { create } from 'zustand';
import { useEditorStore } from './editorStore';
import { detectCleanup, savedSeconds } from '../utils/cleanup';
import type { CleanupMode, Suggestion } from '../utils/cleanup';

interface CleanupState {
  mode: CleanupMode;
  fillers: boolean;
  silences: boolean;
  suggestions: Suggestion[];
  analyzed: boolean;
  rejected: ReadonlySet<string>;
  setMode(mode: CleanupMode): void;
  setKind(kind: 'fillers' | 'silences', on: boolean): void;
  analyze(): void;
  accept(ids: string[]): void;
  acceptAll(): void;
  reject(id: string): void;
  rejectAll(): void;
  reset(): void;
}

const blank = { suggestions: [] as Suggestion[], analyzed: false, rejected: new Set<string>() as ReadonlySet<string> };

export const useCleanupStore = create<CleanupState>()((set, get) => ({
  mode: 'balanced', fillers: true, silences: true, ...blank,

  setMode(mode) { set({ mode }); if (get().analyzed) get().analyze(); },
  setKind(kind, on) { set({ [kind]: on } as Pick<CleanupState, 'fillers' | 'silences'>); if (get().analyzed) get().analyze(); },

  analyze() {
    const e = useEditorStore.getState();
    const c = get();
    const all = detectCleanup(e.words, e.doc.deleted, e.cuts, e.duration, c.mode, { fillers: c.fillers, silences: c.silences });
    set({ analyzed: true, suggestions: all.filter((s) => !c.rejected.has(s.id)) });
  },

  accept(ids) {
    const chosen = get().suggestions.filter((s) => ids.includes(s.id));
    if (!chosen.length) return;
    const f = chosen.filter((s) => s.kind !== 'silence').length;
    const z = chosen.length - f;
    const parts = [f && `${f} filler${f === 1 ? '' : 's'}`, z && `${z} pause${z === 1 ? '' : 's'}`].filter(Boolean).join(' + ');
    // One history step. The editor subscription below re-runs analyze() so accepted items disappear.
    useEditorStore.getState().applyCleanup(chosen.map((s) => ({ words: s.words, gap: s.gap })), `AI cleanup: ${parts} (${savedSeconds(chosen).toFixed(1)}s)`);
  },
  acceptAll() { get().accept(get().suggestions.map((s) => s.id)); },
  reject(id) { set((s) => ({ rejected: new Set(s.rejected).add(id), suggestions: s.suggestions.filter((x) => x.id !== id) })); },
  rejectAll() { set((s) => ({ rejected: new Set([...s.rejected, ...s.suggestions.map((x) => x.id)]), suggestions: [] })); },
  reset() { set({ ...blank, rejected: new Set() }); }
}));

// Keep suggestions in sync with the editor: new transcript -> clear; undo/redo/any edit -> re-scan.
useEditorStore.subscribe((s, prev) => {
  const c = useCleanupStore.getState();
  if (s.words !== prev.words) c.reset();
  else if (s.doc !== prev.doc && c.analyzed) c.analyze();
});
