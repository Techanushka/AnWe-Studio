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
| `/editor/:projectId` | **Placeholder** until the editor is built (protected) |

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
