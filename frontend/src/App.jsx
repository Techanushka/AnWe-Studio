import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import RequireAuth from "./components/dashboard/RequireAuth.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import NewProjectPage from "./pages/NewProjectPage.jsx";
import EditorPlaceholderPage from "./pages/EditorPlaceholderPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage initialMode="login" />} />
      <Route path="/signup" element={<AuthPage initialMode="signup" />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Authenticated workspace: shared sidebar layout, guarded by RequireAuth */}
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects/new" element={<NewProjectPage />} />
      </Route>

      {/* The editor is full-screen (no sidebar) but uses the same auth guard */}
      <Route element={<RequireAuth bare />}>
        <Route path="/editor/:projectId" element={<EditorPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
