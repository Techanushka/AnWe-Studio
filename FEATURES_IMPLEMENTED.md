# AnWe Studio — Dashboard + AI Studio update

## Implemented

- Dashboard analytics cards for total projects, completed transcriptions, known media hours, and estimated time saved.
- Status row for completed, processing, pending and failed projects. The current project schema does not track background jobs, so processing/failed are currently reported as zero with an explicit note.
- AI Summary endpoint and UI for summary, takeaways, quotes, action items and decisions.
- Ask-your-transcript chat with timestamp-grounded Gemini responses when configured; otherwise a clearly labelled keyword-search fallback.
- Natural-language editing assistant that creates a structured proposal, shows operations/timestamps for review, and requires user approval before saving the plan.
- Local rule-based proposal support for removing long pauses, creating transcript highlights, suggesting vertical 9:16 framing, and preparing Hindi subtitle operations.
- Transcript persistence from the editor to the existing authenticated backend endpoint so the dashboard AI tools can read the transcript.
- Per-user AI summary/edit metadata storage in the SQLite database.
- Server-side Gemini configuration; the API key is not sent to the browser.

## Setup

1. Merge this folder into your existing `AnWe-Studio` project (keep your own `backend/.env` and local files).
2. In `backend/.env`, add:

   ```env
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_MODEL=gemini-2.5-flash
   ```

   A key is optional. Without it, summaries use extractive analysis, transcript chat uses keyword matching, and a few editing commands use a local rule parser.
3. The Vite dev server now proxies `/api/*` to `http://127.0.0.1:8000` and strips the `/api` prefix, matching the existing `frontend/.env.example` value `VITE_API_BASE_URL=/api`. If your backend runs on another port, update the proxy target in `frontend/vite.config.js`.
4. Install dependencies if needed: `pip install -r backend/requirements.txt` and `npm install` in `frontend`.
5. Run the backend using the existing project entry point: `cd backend; uvicorn main:app --port 8000 --reload`. Run the frontend with `cd frontend; npm run dev`.

## API endpoints

- `GET /dashboard/analytics`
- `POST /projects/{project_id}/ai/summary`
- `POST /projects/{project_id}/ai/chat` — JSON body `{ "question": "..." }`
- `POST /projects/{project_id}/ai/edit-proposal` — JSON body `{ "command": "..." }`
- `POST /projects/{project_id}/ai/apply-edit` — JSON body `{ "proposal": { ... } }`
- Existing `PUT /projects/{project_id}/transcript` is used to persist transcript segments.

All routes require the signed-in user's session and only access that user's project.

## Important scope boundary

Approving an editing command saves the structured plan and its timestamped suggestions. The current editor does not yet render new video files; actual silence cutting in the exported file, crop encoding, and generating translated subtitle text still need to be connected to a media-rendering/export pipeline. The UI makes this boundary explicit instead of claiming that an output video was already rendered.

## Validation performed

- Backend Python files compile successfully.
- AI routes import and register when the dependencies listed in `backend/requirements.txt` are available.
- Frontend TypeScript type-check passes (`tsc --noEmit`).
- A full Vite build could not be run in this Linux environment because the uploaded `node_modules` contains Windows-specific Rollup optional dependencies; run `npm install` on your machine if your local build reports the same native-package issue.
