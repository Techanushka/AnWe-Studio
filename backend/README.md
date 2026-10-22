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
