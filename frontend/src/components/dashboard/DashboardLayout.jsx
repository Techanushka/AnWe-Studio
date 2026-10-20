import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { authService, errorMessage } from '../../services/authService.js';
import { DashboardContext } from './dashboardContext.js';
import DashboardSidebar from './DashboardSidebar.jsx';
import Icon from './Icon.jsx';

const COLLAPSE_KEY = 'anwe.sidebar.collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

export default function DashboardLayout({ user, previewMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(0);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const toggleCollapsed = () => setCollapsed((value) => {
    try { localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1'); } catch { /* storage unavailable */ }
    return !value;
  });

  const notify = useCallback((message, type = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ message, type, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (!previewMode) await authService.logout();
      navigate(previewMode ? '/' : '/login', { replace: true });
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  }, [previewMode, navigate, notify]);

  return (
    <DashboardContext.Provider value={{ user, previewMode, notify, logout, openDrawer: () => setDrawerOpen(true) }}>
      <div className={`db${collapsed ? ' is-collapsed' : ''}${drawerOpen ? ' drawer-open' : ''}`}>
        <a className="skip" href="#main">Skip to content</a>
        <DashboardSidebar collapsed={collapsed} onToggle={toggleCollapsed} onClose={() => setDrawerOpen(false)} />
        <div className="db-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
        <div className="db-main">
          <div className="db-mobilebar">
            <button type="button" className="icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen}><Icon name="menu" /></button>
            <Link to="/dashboard" className="brand" aria-label="Anwe Studio dashboard"><span className="logo" aria-hidden="true" />Anwe Studio</Link>
          </div>
          {previewMode && (
            <div className="banner" role="status">
              <Icon name="alert" size={16} />
              <span><b>Preview mode.</b> No backend is connected (<code>VITE_API_BASE_URL</code> is empty), so you’re seeing sample projects and nothing is saved or uploaded.</span>
            </div>
          )}
          <main id="main" tabIndex={-1}><Outlet /></main>
        </div>
        <div className="toast-region" role="status" aria-live="polite">
          {toast && <div key={toast.id} className={`toast ${toast.type}`}><Icon name={toast.type === 'error' ? 'alert' : 'check'} size={16} />{toast.message}</div>}
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
