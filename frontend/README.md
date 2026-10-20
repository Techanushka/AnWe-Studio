# Anwe Studio — React authentication frontend

React + Vite conversion of the supplied Anwe Studio login/signup HTML.

## Folder flow

```text
anwe-studio-react/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── README.md
└── src/
    ├── main.jsx          # React entry point
    ├── App.jsx            # Login, signup, reset-password UI and validation
    ├── authService.js     # API requests and auth error handling
    └── styles.css         # Responsive styling from the original HTML
```

## Run locally

1. Install Node.js (LTS).
2. Open this folder in VS Code.
3. Open a terminal in this folder and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open the local URL printed by Vite (usually `http://localhost:5173`).

To verify a production build:

```bash
npm run build
npm run preview
```

## Backend connection

The frontend is wired for these backend endpoints:

- `POST /auth/login` with `{ email, password, remember }`
- `POST /auth/signup` with `{ name, email, password }`
- `POST /auth/forgot-password` with `{ email }`
- `GET /auth/me` to check an existing session
- Google OAuth redirect configured through `VITE_GOOGLE_AUTH_URL`

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL`, `VITE_GOOGLE_AUTH_URL`, and `VITE_DASHBOARD_URL` to match your backend. Restart Vite after changing environment variables.

**Important:** The original HTML explicitly had an empty API base and Google URL. This React conversion preserves that safety: the interface and validation work, but real login/signup/reset and Google sign-in need a backend/API and OAuth configuration. It does not fake successful authentication.
