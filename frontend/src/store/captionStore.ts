import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_STYLE } from '../utils/captions';
import type { CaptionStyle } from '../utils/captions';

interface CaptionState { style: CaptionStyle; patch(p: Partial<CaptionStyle>): void; reset(): void }

/** Caption look. Remembered in this browser (localStorage) so it survives reloads and other projects. */
export const useCaptionStore = create<CaptionState>()(persist(
  (set) => ({
    style: DEFAULT_STYLE,
    patch: (p) => set((s) => ({ style: { ...s.style, ...p } })),
    reset: () => set({ style: DEFAULT_STYLE })
  }),
  {
    name: 'anwe-caption-style',
    partialize: (s) => ({ style: s.style }),
    merge: (saved, current) => ({ ...current, style: { ...DEFAULT_STYLE, ...((saved as Partial<CaptionState> | undefined)?.style ?? {}) } })
  }
));
