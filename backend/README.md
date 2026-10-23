# Anwe Studio – backend (FastAPI)

Accounts, projects, video storage and (optionally) server-side transcription. Data lives in `backend/data/` (SQLite + uploaded videos).

## Run (Windows)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env        # optional, defaults work for local development
uvicorn main:app --port 8000 --reload
```

macOS/Linux: `source .venv/bin/activate` and `cp .env.example .env`. Python 3.10 or newer.

Check that everything works (with the server running, in a second window):

```powershell
python smoke_test.py
```

It signs up two test users and checks login, upload, video streaming/seeking, saving edits, rename/duplicate/delete and that users can't see each other's projects. Offline unit tests for the core logic: `python -m unittest test_core -v`.

## What it provides

| Area | Endpoints |
|------|-----------|
| Auth (cookie session, HttpOnly) | `POST /auth/signup`, `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me`, `/auth/google` |
| Projects (owner only) | `GET/POST /projects`; `GET/PATCH/DELETE /projects/{id}`; `POST /projects/{id}/duplicate`; `PUT /projects/{id}/transcript`, `/state`; `GET /projects/{id}/video` (Range), `/thumbnail` |
| Other | `GET /exports` (empty: the editor doesn't render video files yet), `POST /transcribe` (optional), `GET /health` |

* Passwords are hashed with scrypt; session tokens are stored only as hashes; login/signup/forgot-password are rate limited.
* **Password reset emails:** without SMTP settings the reset link is printed in this console. Set `SMTP_*` in `.env` to send real emails.
* **Google sign-in** needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env` (redirect URI `http://localhost:5173/api/auth/google/callback`). Not configured = the button shows a friendly message. This part has not been run against Google.
* **Server transcription (optional):** `pip install -r requirements-transcribe.txt`, then set `VITE_TRANSCRIBE_URL=/api` in `frontend/.env`. Without it the browser transcribes (no install). `WHISPER_MODEL=small` suits CPUs; `large-v3` needs a GPU.
* SQLite and local disk are right for one server. For production put it behind HTTPS (`COOKIE_SECURE=1`) and back up `backend/data/`.


## Dashboard Analytics and AI Studio

The authenticated API now includes (the running app is `uvicorn main:app --reload`, using the existing SQLite backend):

- `GET /dashboard/analytics` — per-user project counts, known media duration, status counts, and an explicitly heuristic time-saved estimate.
- `PUT /projects/{project_id}/transcript` — persist transcript segments so AI Studio can access them across sessions/devices.
- `POST /projects/{project_id}/ai/summary` — summary, takeaways, quotes, action items, and decisions.
- `POST /projects/{project_id}/ai/chat` with `{ "question": "..." }` — question answering grounded in the transcript with timestamp citations when Gemini is configured.
- `POST /projects/{project_id}/ai/edit-proposal` with `{ "command": "..." }` — structured, reviewable edit proposal.
- `POST /projects/{project_id}/ai/apply-edit` with `{ "proposal": { ... } }` — saves an approved edit plan to the project metadata.

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in `backend/.env` to enable Gemini-powered semantic summary/chat/command interpretation and subtitle translation proposals. The key stays on the server. Without a key, summary uses extractive local analysis, chat uses keyword matching, and a small set of editing commands is handled by a local rule parser. The dashboard clearly labels these fallback modes.

**Current scope note:** approval stores an edit plan; actual video rendering, crop encoding, and translated subtitle generation still require the media export pipeline. The UI states this instead of pretending the video has already been rendered.
