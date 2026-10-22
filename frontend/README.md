# Anwe Studio – Frontend

React + Vite. The landing page is the first page; login and sign up are separate routes.

## Routes

| Path      | Page                                   |
|-----------|----------------------------------------|
| `/`       | Landing page (features, animations)    |
| `/login`  | Log in (slide-over auth card)          |
| `/signup` | Sign up                                |
| `/dashboard` | Dashboard (protected)               |
| `/projects/new` | Upload / create a project (protected) |
| `/editor/:projectId` | Editor: transcript editing, preview + timeline, undo/redo history (protected) |

## Folder structure

```text
frontend/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── README.md
└── src/
    ├── main.jsx                 # Entry: Router + global styles
    ├── App.jsx                  # Route table
    ├── index.css                # Tiny global reset
    ├── pages/
    │   ├── LandingPage.jsx      # Landing page (first page)
    │   └── AuthPage.jsx         # Login, signup, reset password
    ├── components/landing/      # Navbar, Hero, EditorPreview, Marquee,
    │                            # Features, FeatureCard, FinalCta, Footer, ScrollProgress
    ├── hooks/useReveal.js       # Scroll-reveal animation hook
    ├── data/features.js         # The 10 features (edit text here)
    ├── services/authService.js  # API calls for auth
    └── styles/
        ├── landing.css          # Scoped to .lp
        └── auth.css             # Scoped to .au
```

## Run

```bash
cd frontend
npm install
cp .env.example .env     # then set your backend URLs
npm run dev
```

Open http://localhost:5173. Build with `npm run build`.

## Backend

Auth needs a backend (`/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/me`, Google OAuth). Set `VITE_API_BASE_URL`, `VITE_GOOGLE_AUTH_URL` and `VITE_DASHBOARD_URL` in `.env`. Without them the forms validate but show a "not connected" message instead of faking a login.

## Dashboard

Files: `pages/DashboardPage.jsx`, `pages/NewProjectPage.jsx`, `pages/EditorPlaceholderPage.jsx`, `components/dashboard/*`,
`services/projectService.js` (all project API calls), `hooks/useProjects.js`, `hooks/useMenu.js`, `data/mockProjects.js`, `styles/dashboard.css` (scoped to `.db`).

Routes under `RequireAuth` call `GET /auth/me` (cookie auth). If `VITE_API_BASE_URL` is empty the dashboard opens in a clearly labelled **preview mode** with sample data; nothing is uploaded.

### Backend endpoints the dashboard expects (not implemented yet)

| Method | Path | Notes |
|--------|------|-------|
| POST   | `/auth/logout` | Clears the session cookie |
| GET    | `/projects` | Only the signed-in user's projects: `{ projectId, name, thumbnail, duration, status: draft\|processing\|ready, createdAt, updatedAt }` |
| POST   | `/projects` | `multipart/form-data`: `video`, `name`, `duration?` |
| PATCH  | `/projects/:projectId` | `{ name }` |
| POST   | `/projects/:projectId/duplicate` | |
| DELETE | `/projects/:projectId` | |
| GET    | `/exports` | Optional. `{ exportId, name, projectId, createdAt, format, resolution, downloadUrl? }` |

The server must check project ownership on every request; the frontend never sends a user id.
`VITE_MAX_UPLOAD_MB` (default 2048) sets the client-side upload limit.

## Speech-to-text (transcript window)

Choosing a video on the upload card opens a transcript window and starts transcribing right away.
Everything runs in the browser: `utils/audio.js` decodes the audio to 16 kHz mono, `workers/transcribeWorker.js`
runs Whisper (`@xenova/transformers`) in a Web Worker, and `hooks/useTranscriber.js` exposes progress and lines.
The model (about 40 MB for "Fast", 80 MB for "Better") downloads once from the Hugging Face CDN and is cached by the browser.
Videos up to 500 MB are supported (`MAX_TRANSCRIBE_MB` in `useTranscriber.js`). Exports: copy, `.txt`, `.srt`.
When the project is created, finished lines are sent as a JSON `transcript` field (`[{ start, end, text }]`, seconds) on `POST /projects`.
After pulling this change run `npm install` (adds `@xenova/transformers`).


## Transcription accuracy

Two modes, chosen by `VITE_TRANSCRIBE_URL` in `.env`:

| Mode | When | Accuracy |
|------|------|----------|
| **Server** (recommended) | `VITE_TRANSCRIBE_URL=http://localhost:8000` and `/backend` running | Whisper large-v3, VAD, beam search, word timestamps |
| **Browser** (default) | variable empty | Whisper small/base/tiny in a Web Worker, nothing leaves the device |

The browser pipeline (`src/workers/transcribeWorker.js`, `src/utils/asr/*`) boosts quiet audio, cuts speech at pauses instead of every 30 s, locks the language after the first chunks, retries repetition loops and drops invented text. Check the logic with `npm run test:asr`.


## Editor – Features 1, 2 and 3 – `/editor/:projectId`

Opens from the dashboard after a video is uploaded and transcribed (the dashboard's *Transcript Editor*, *Video Timeline* and *Edit History* shortcuts open the same page). The editor is written in TypeScript (React + Zustand); the rest of the app is still JavaScript and the two work together (`allowJs`).

```text
src/
├── types/editor.ts               # Word, Segment, EditDoc, HistoryEntry, Crop …
├── utils/editModel.ts            # pure logic: words, cuts, trim, time mapping, search, crop, exports
├── utils/waveform.ts             # Web Audio peaks for the timeline
├── store/editorStore.ts          # Zustand: edits (EditDoc) + undo/redo history + selection + search
├── store/playheadStore.ts        # current playback time (changes every frame, kept separate)
├── hooks/usePlaybackEngine.ts    # plays the video while skipping cuts, keeps A/V in sync
├── hooks/useWaveform.ts          # decodes + caches the waveform
├── services/editorStorage.ts     # IndexedDB (video, transcript, edit state + history, waveform)
├── services/editorService.ts     # loads a project (browser copy first, then GET /projects/:id)
├── pages/EditorPage.tsx          # wires everything, saves history, global shortcuts
└── components/editor/            # TranscriptPanel, VideoPreview, Timeline, SidePanel (Cuts / History / Crop), EditorTopBar, TranscribeGate
```

### Feature 1 – Transcript-based editing
* Timestamped transcript. Click a word or a timestamp to jump the video there.
* Select: drag, Shift+click (range), Ctrl/Cmd+click (toggle), double-click (sentence), *Select all matches*.
* Delete / Backspace removes the selection. The preview skips those parts, and the timeline shows them as cuts. Nothing is lost: words are only flagged.
* Search with match count, next/previous (Enter / Shift+Enter).
* Restore from the selection bar, the line button, or the *Cuts* tab (per segment, or *Restore all*).
* Caption text: select one word and press *Edit text* (or F2) to change what a word says in the transcript, search and exports. The original timing stays.

### Feature 2 – Preview and interactive timeline
* Player with play/pause (Space), seek bar in *edited* time, ±5 s (arrows, Shift = 10 s), speed 0.5×–2×, volume/mute. *Skip cuts* switches between the edit and the original.
* Timeline with two tracks on one scale: **Source** (audio waveform, deleted ranges in red, trimmed ends in grey, draggable trim handles) and **Edited** (the remaining clips joined together, a diamond at every cut boundary). Zoom, scrub by clicking/dragging either track, keyboard arrows.
* Source ↔ edited mapping: the header shows `Source 0:15 → Edited 0:09` for the playhead; clicking the Edited track maps back to the right source time (`sourceToEdited` / `editedToSource`).
* Trim: *Set start* / *Set end* at the playhead, drag the handles, or use the arrow keys on a focused handle. Crop: *Crop* tab (16:9, 9:16, 1:1, 4:5, 4:3, with zoom and pan).
* Audio/video sync: one `<video>` element plays picture and sound, so they cannot drift apart. A cut is skipped by one `currentTime` jump, and the player looks one frame ahead (rate × 20 ms) so the jump lands on the cut boundary. Cuts are read from the store every frame, so deleting words while playing takes effect at once. The player pauses when the tab is hidden, because browsers throttle animation frames in background tabs.

### Feature 3 – Undo / redo and edit history
* Every cut, restore, trim, caption change and crop is one history step (slider drags are merged into one step).
* Undo / Redo buttons in the top bar, **Ctrl/Cmd+Z**, **Ctrl/Cmd+Shift+Z**, **Ctrl+Y**. The shortcuts are left alone while you type in a text box, so the browser's own undo still works there.
* *History* tab: every step with its time; click any step to go back (or forward) to it. A new edit after an undo drops the redo branch. At most 150 steps are kept.
* Saved in IndexedDB (debounced, and on page hide): after a reload the edits **and** the undo history come back. Saved state is ignored if the transcript was regenerated. Projects saved by the Feature-1-only version are still read.

### Export
Edited transcript (`.txt`), edited captions (`.srt`, re-timed, with caption edits and without trimmed words), and an edit list (`.json`, version 2: cuts, kept ranges, trim, caption edits, crop with its pixel size). **Rendering a new video file is not included yet**; the edit list contains everything FFmpeg needs.

## Checks

```bash
npm run typecheck     # TypeScript
npm run test:editor   # editing logic, store, undo/redo, saving (tsx)
npm run test:ui       # editor components in jsdom (Vitest + Testing Library)
npm run test:asr      # speech post-processing
npm run check         # all of the above
```

Run `npm install` after pulling (adds TypeScript, Vitest, jsdom, Testing Library, tsx and `@types/*`).
