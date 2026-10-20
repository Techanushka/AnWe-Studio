import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import useMenu from '../../hooks/useMenu.js';
import { formatDuration, formatEdited } from '../../utils/format.js';

const STATUS = { draft: 'Draft', processing: 'Processing', ready: 'Ready' };
const HUES = [['#8b7cff', '#3a2f8f'], ['#5eead4', '#14575a'], ['#f9a8d4', '#6b2f63']];
const hueFor = (id) => HUES[[...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % HUES.length];

export default function ProjectCard({ project, onRename, onDuplicate, onDelete }) {
  const menu = useMenu();
  const [imageFailed, setImageFailed] = useState(false);
  const [from, to] = hueFor(project.projectId);
  const href = `/editor/${encodeURIComponent(project.projectId)}`;
  const duration = formatDuration(project.duration);

  return (
    <article className="pcard">
      <Link to={href} className="thumb" tabIndex={-1} aria-hidden="true" style={{ '--from': from, '--to': to }}>
        {project.thumbnail && !imageFailed
          ? <img src={project.thumbnail} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          : <span className="thumb-ph"><Icon name="play" size={26} /></span>}
        {duration && <span className="dur">{duration}</span>}
      </Link>
      <div className="pcard-body">
        <div className="pcard-top">
          <span className={`status-badge ${project.status}`}>{STATUS[project.status]}</span>
          {project.isMock && <span className="sample-badge" title="Sample data, not saved to a backend">{project.isLocalDraft ? 'Local draft' : 'Sample'}</span>}
          <div className="menu-wrap" ref={menu.wrapRef} onBlur={menu.onBlur}>
            <button type="button" ref={menu.triggerRef} className="icon-btn sm" aria-haspopup="menu" aria-expanded={menu.open}
              aria-label={`More actions for ${project.name}`} onClick={() => menu.setOpen(!menu.open)}><Icon name="more" /></button>
            {menu.open && (
              <div className="menu right" role="menu" aria-label={`Actions for ${project.name}`} ref={menu.menuRef} onKeyDown={menu.onMenuKeyDown}>
                <button type="button" role="menuitem" className="menu-item" onClick={() => { menu.close(); onRename(project); }}><Icon name="edit" size={16} />Rename</button>
                <button type="button" role="menuitem" className="menu-item" onClick={() => { menu.close(); onDuplicate(project); }}><Icon name="copy" size={16} />Duplicate</button>
                <button type="button" role="menuitem" className="menu-item danger" onClick={() => { menu.close(); onDelete(project); }}><Icon name="trash" size={16} />Delete</button>
              </div>
            )}
          </div>
        </div>
        <h3 title={project.name}>{project.name}</h3>
        <p className="pcard-meta"><Icon name="clock" size={14} />Edited {formatEdited(project.updatedAt)}</p>
        <Link to={href} className="btn ghost sm">{project.status === 'processing' ? 'Open project' : 'Continue Editing'}</Link>
      </div>
    </article>
  );
}
