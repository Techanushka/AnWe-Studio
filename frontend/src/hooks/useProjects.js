import { useCallback, useEffect, useState } from 'react';
import { projectService, projectErrorMessage } from '../services/projectService.js';

export default function useProjects() {
  const [state, setState] = useState({ projects: [], status: 'loading', error: '' });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    try {
      const projects = await projectService.listProjects();
      setState({ projects, status: 'ready', error: '' });
    } catch (error) {
      setState((s) => ({ ...s, status: 'error', error: projectErrorMessage(error) }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rename = useCallback(async (projectId, name) => {
    const updated = await projectService.renameProject(projectId, name);
    setState((s) => ({ ...s, projects: s.projects.map((p) => (p.projectId === projectId ? { ...p, ...updated } : p)) }));
  }, []);
  const duplicate = useCallback(async (projectId) => {
    const created = await projectService.duplicateProject(projectId);
    setState((s) => ({ ...s, projects: [created, ...s.projects] }));
  }, []);
  const remove = useCallback(async (projectId) => {
    await projectService.deleteProject(projectId);
    setState((s) => ({ ...s, projects: s.projects.filter((p) => p.projectId !== projectId) }));
  }, []);

  return { ...state, reload: load, rename, duplicate, remove };
}
