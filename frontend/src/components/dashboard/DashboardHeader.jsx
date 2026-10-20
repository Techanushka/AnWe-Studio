import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import useMenu from '../../hooks/useMenu.js';
import { useDashboard } from './dashboardContext.js';

export default function DashboardHeader({ query, onQuery }) {
  const { user, logout } = useDashboard();
  const menu = useMenu();
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <header className="db-header">
      <div className="greet">
        <h1>{firstName ? `Hey, ${firstName}!` : 'Hey there!'} Ready to create something amazing?</h1>
        <p>Pick up where you left off or start a fresh edit.</p>
      </div>
      <div className="head-actions">
        <div className="search">
          <Icon name="search" size={17} />
          <label htmlFor="project-search" className="sr">Search projects by name</label>
          <input id="project-search" type="search" placeholder="Search projects" value={query}
            onChange={(event) => onQuery(event.target.value)} autoComplete="off" />
        </div>
        <Link to="/projects/new" className="btn primary"><Icon name="plus" size={17} />New Project</Link>
        <div className="menu-wrap" ref={menu.wrapRef} onBlur={menu.onBlur}>
          <button type="button" ref={menu.triggerRef} className="avatar-btn" aria-haspopup="menu" aria-expanded={menu.open}
            aria-label="Account menu" onClick={() => menu.setOpen(!menu.open)}><Avatar user={user} size={40} /></button>
          {menu.open && (
            <div className="menu right" role="menu" aria-label="Account" ref={menu.menuRef} onKeyDown={menu.onMenuKeyDown}>
              <div className="menu-id"><b>{user.name || 'Your account'}</b><span>{user.email}</span></div>
              <Link role="menuitem" className="menu-item" to={{ pathname: '/dashboard', hash: '#projects' }} onClick={menu.close}><Icon name="folder" size={16} />My projects</Link>
              <Link role="menuitem" className="menu-item" to="/projects/new" onClick={menu.close}><Icon name="plus" size={16} />New project</Link>
              <button type="button" role="menuitem" className="menu-item" onClick={() => { menu.close(); logout(); }}><Icon name="logout" size={16} />Log out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
