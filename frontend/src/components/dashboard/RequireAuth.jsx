import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { API_CONFIGURED, authService } from '../../services/authService.js';
import DashboardLayout from './DashboardLayout.jsx';

// /auth/me may return the user directly or wrapped in { user }.
function normalizeUser(data) {
  const u = data?.user || data || {};
  return {
    name: u.name || u.fullName || u.full_name || '',
    email: u.email || '',
    avatarUrl: u.avatarUrl || u.avatar_url || u.picture || ''
  };
}

const PREVIEW_USER = { name: '', email: 'preview@anwe.studio', avatarUrl: '' };

/**
 * Protects dashboard routes with the existing auth mechanism (GET /auth/me with cookies).
 * If no backend is configured, nobody can sign in, so the dashboard opens in a clearly labelled
 * preview mode instead of redirecting forever or faking a session.
 */
export default function RequireAuth({ bare = false }) {
  const [state, setState] = useState({ status: 'checking', user: null });

  useEffect(() => {
    let alive = true;
    if (!API_CONFIGURED) { setState({ status: 'preview', user: PREVIEW_USER }); return undefined; }
    authService.me().then((data) => {
      if (!alive) return;
      setState(data ? { status: 'in', user: normalizeUser(data) } : { status: 'out', user: null });
    });
    return () => { alive = false; };
  }, []);

  if (state.status === 'checking') {
    return <div className="db db-boot" role="status" aria-live="polite"><i className="spin big" aria-hidden="true" /><span>Opening your workspace…</span></div>;
  }
  if (state.status === 'out') return <Navigate to="/login" replace />;
  if (bare) return <Outlet context={{ user: state.user, previewMode: state.status === 'preview' }} />; // full-screen pages (editor)
  return <DashboardLayout user={state.user} previewMode={state.status === 'preview'} />;
}
