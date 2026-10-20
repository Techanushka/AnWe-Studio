import { Link } from 'react-router-dom';
import ProjectCard from './ProjectCard.jsx';
import Icon from './Icon.jsx';

export default function ProjectGrid({ status, error, onRetry, total, projects, hasActiveFilters, onClearFilters, onRename, onDuplicate, onDelete }) {
  if (status === 'loading') {
    return (
      <div className="pgrid" aria-busy="true" aria-label="Loading projects">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="pcard skeleton" key={i}><div className="thumb" /><div className="pcard-body"><i className="sk w40" /><i className="sk w80" /><i className="sk w60" /></div></div>
        ))}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="empty" role="alert">
        <span className="empty-icon bad"><Icon name="alert" size={26} /></span>
        <h3>We couldn’t load your projects</h3>
        <p>{error}</p>
        <button type="button" className="btn primary" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="empty">
        <span className="empty-icon"><Icon name="film" size={26} /></span>
        <h3>No projects yet</h3>
        <p>Upload a recording and turn it into your first edit.</p>
        <Link to="/projects/new" className="btn primary"><Icon name="plus" size={17} />Create Your First Project</Link>
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="empty">
        <span className="empty-icon"><Icon name="search" size={26} /></span>
        <h3>No projects match</h3>
        <p>Try a different search, or switch back to all projects.</p>
        {hasActiveFilters && <button type="button" className="btn ghost" onClick={onClearFilters}>Clear search and filters</button>}
      </div>
    );
  }
  return (
    <div className="pgrid">
      {projects.map((project) => <ProjectCard key={project.projectId} project={project} onRename={onRename} onDuplicate={onDuplicate} onDelete={onDelete} />)}
    </div>
  );
}
