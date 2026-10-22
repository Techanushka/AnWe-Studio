import { create } from 'zustand';

/** Current playback position (source seconds). Kept apart from the editor store because it changes every frame. */
export const usePlayhead = create<{ time: number; set: (time: number) => void }>((set) => ({
  time: 0,
  set: (time) => set((s) => (s.time === time ? s : { time }))
}));
