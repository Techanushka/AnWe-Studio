import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DashboardHeader from '../components/dashboard/DashboardHeader.jsx';
import WelcomeCard from '../components/dashboard/WelcomeCard.jsx';
import VideoUploadCard from '../components/dashboard/VideoUploadCard.jsx';
import ProjectFilters from '../components/dashboard/ProjectFilters.jsx';
import ProjectGrid from '../components/dashboard/ProjectGrid.jsx';
import QuickTools from '../components/dashboard/QuickTools.jsx';
import RecentExports from '../components/dashboard/RecentExports.jsx';
import { RenameDialog, DeleteDialog } from '../components/dashboard/ProjectDialogs.jsx';
import { useDashboard } from '../components/dashboard/dashboardContext.js';
import useProjects from '../hooks/useProjects.js';
import { projectErrorMessage } from '../services/projectService.js';

const SORTERS = {
  recent: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
  newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
};

export default function DashboardPage() {
  const { notify } = useDashboard();
  const { projects, status, error, reload, rename, duplicate, remove } = useProjects();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { document.title = 'Dashboard – Anwe Studio'; }, []);

  // Sidebar links like /dashboard#projects scroll to their section.
  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [location.hash]);

  const counts = useMemo(() => ({
    all: projects.length,
    draft: projects.filter((p) => p.status === 'draft').length,
    processing: projects.filter((p) => p.status === 'processing').length,
    ready: projects.filter((p) => p.status === 'ready').length
  }), [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (filter === 'all' || p.status === filter) && (!q || p.name.toLowerCase().includes(q)))
      .sort(SORTERS[sort]);
  }, [projects, query, filter, sort]);

  async function handleDuplicate(project) {
    try { await duplicate(project.projectId); notify(`Duplicated “${project.name}”.`); }
    catch (err) { notify(projectErrorMessage(err), 'error'); }
  }

  return (
    <div className="page">
      <DashboardHeader query={query} onQuery={setQuery} />

      <div className="hero-grid">
        <WelcomeCard />
        <VideoUploadCard />
      </div>

      <section className="block" id="projects" aria-labelledby="projects-title">
        <div className="block-head">
          <h2 id="projects-title">My projects</h2>
          {status === 'ready' && <p className="block-sub" aria-live="polite">Showing {visible.length} of {projects.length}</p>}
        </div>
        <ProjectFilters filter={filter} onFilter={setFilter} sort={sort} onSort={setSort} counts={counts} />
        <ProjectGrid
          status={status} error={error} onRetry={reload} total={projects.length} projects={visible}
          hasActiveFilters={Boolean(query.trim()) || filter !== 'all'}
          onClearFilters={() => { setQuery(''); setFilter('all'); }}
          onRename={setRenaming} onDuplicate={handleDuplicate} onDelete={setDeleting} />
      </section>

      <QuickTools projects={projects} loading={status === 'loading'} />
      <RecentExports />

      {renaming && (
        <RenameDialog project={renaming} onClose={() => setRenaming(null)}
          onSubmit={async (name) => { await rename(renaming.projectId, name); notify('Project renamed.'); }} />
      )}
      {deleting && (
        <DeleteDialog project={deleting} onClose={() => setDeleting(null)}
          onConfirm={async () => { await remove(deleting.projectId); notify(`Deleted “${deleting.name}”.`); }} />
      )}
    </div>
  );
}
