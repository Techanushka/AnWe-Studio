/** Shared types for the editor (Features 1–3). Times are in seconds on the SOURCE video unless noted. */

export interface Range { start: number; end: number }

/** One word as reported by the speech model (server) – optional on a segment. */
export interface WordTiming { word?: string; text?: string; start: number; end: number }

/** A transcript line from Whisper / Transformers.js. */
export interface Segment { start: number; end: number; text: string; words?: WordTiming[] }

export interface Word {
  i: number; text: string; start: number; end: number;
  line: number; sentence: number; estimated: boolean;
}
export interface Line { line: number; from: number; to: number; start: number }
export interface Run extends Range { from: number; to: number; count: number; text: string }
export interface Match { from: number; to: number }

export type AspectId = '16:9' | '9:16' | '1:1' | '4:5' | '4:3';
/** Parametric crop: independent of the video size, so it survives a re-upload. */
export interface Crop { aspect: AspectId; zoom: number; panX: number; panY: number }
/** Crop as a rectangle of the source frame, 0..1. */
export interface CropRect { x: number; y: number; w: number; h: number }
export interface VideoSize { w: number; h: number }

/** Everything an undo step can change. Immutable: every edit produces a new EditDoc. */
export interface EditDoc {
  deleted: ReadonlySet<number>;
  captions: Readonly<Record<number, string>>;
  trim: Range | null;
  crop: Crop | null;
  /** [AI] Feature 4: pauses cut by AI cleanup, as source-time ranges (a pause is not a word, so it can't live in `deleted`). */
  gaps: ReadonlyArray<Range>;
}

export type EditKind = 'start' | 'cut' | 'restore' | 'trim' | 'caption' | 'crop' | 'saved';
export interface HistoryEntry { id: number; kind: EditKind; label: string; at: number; doc: EditDoc }

/** Compact JSON form of an EditDoc (deleted words are stored as ranges). */
export interface SerializedDoc {
  deleted: Array<[number, number]>;
  captions: Record<string, string>;
  trim: Range | null;
  crop: Crop | null;
  /** [AI] optional, so projects saved before Feature 4 still load. */
  gaps?: Range[];
}
export interface SavedHistory {
  v: 2; key: string; index: number; nextId: number;
  entries: Array<{ id: number; kind: EditKind; label: string; at: number; doc: SerializedDoc }>;
}

/** [AI] Feature 4: one accepted cleanup suggestion = words to delete and/or a time range to cut. */
export interface CleanupItem { words: number[]; gap: Range | null }

/** Record kept in IndexedDB for each project (see services/editorStorage.ts). */
export interface ProjectRecord {
  projectId: string;
  name?: string;
  file?: File;
  duration?: number | null;
  transcript?: Segment[] | null;
  /** Legacy (Feature 1 only) saved cuts. Still read, never written. */
  edits?: { deleted: number[]; key: string } | null;
  /** Feature 3: saved edit state + undo history. */
  editState?: SavedHistory | null;
  /** Feature 2: audio waveform peaks (0..255 per bucket, see utils/waveform.ts). */
  peaks?: Uint8Array | null;
  updatedAt?: number;
}

export interface LoadedProject {
  projectId: string;
  name: string;
  file: File | null;
  videoUrl: string;
  duration: number | null;
  transcript: Segment[] | null;
  saved: SavedHistory | null;
  legacy: { deleted: number[]; key: string } | null;
  peaks: Uint8Array | null;
  origin: 'browser' | 'server';
}
