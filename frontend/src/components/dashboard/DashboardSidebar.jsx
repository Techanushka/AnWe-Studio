import { Link, NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import { useDashboard } from './dashboardContext.js';

// `to` only for pages that exist. Settings and Help have no page yet, so they are shown as disabled.
const NAV = [
  { label: 'Dashboard', icon: 'home', to: '/dashboard', end: true },
  { label: 'My Projects', icon: 'folder', to: { pathname: '/dashboard', hash: '#projects' } },
  { label: 'Create New Project', icon: 'plus', to: '/projects/new' },
  { label: 'Recent Exports', icon: 'download', to: { pathname: '/dashboard', hash: '#exports' } },
  { label: 'Settings', icon: 'settings', soon: true },
  { label: 'Help & Support', icon: 'help', soon: true }
];

export default function DashboardSidebar({ collapsed, onToggle, onClose }) {
  const { user, logout } = useDashboard();
  const displayName = user.name || 'Your account';

  return (
    <aside className="db-side" aria-label="Sidebar">
      <div className="side-top">
        <Link to="/dashboard" className="brand" aria-label="Anwe Studio dashboard"><span className="logo" aria-hidden="true" /><span className="lbl">Anwe Studio</span></Link>
        <button type="button" className="icon-btn collapse-btn" onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed}><Icon name="chevronLeft" /></button>
        <button type="button" className="icon-btn close-btn" onClick={onClose} aria-label="Close navigation"><Icon name="x" /></button>
      </div>

      <nav aria-label="Main">
        <ul className="nav">
          {NAV.map((item) => (
            <li key={item.label}>
              {item.soon ? (
                <span className="nav-item is-disabled" aria-disabled="true" title={`${item.label}: coming soon`}>
                  <Icon name={item.icon} /><span className="lbl">{item.label}</span><span className="pill lbl">Soon</span>
                </span>
              ) : typeof item.to === 'object' ? (
                <Link className="nav-item" to={item.to} aria-label={item.label} title={item.label}><Icon name={item.icon} /><span className="lbl">{item.label}</span></Link>
              ) : (
                <NavLink className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} to={item.to} end={item.end} aria-label={item.label} title={item.label}>
                  <Icon name={item.icon} /><span className="lbl">{item.label}</span>
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="side-user">
        <Avatar user={user} size={38} />
        <div className="who lbl"><b>{displayName}</b><span>{user.email}</span></div>
        <button type="button" className="icon-btn" onClick={logout} aria-label="Log out" title="Log out"><Icon name="logout" /></button>
      </div>
    </aside>
  );
}
