import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { projectService, projectErrorMessage } from '../../services/projectService.js';
import { formatDate } from '../../utils/format.js';

export default function RecentExports() {
  const [state, setState] = useState({ status: 'loading', items: [], error: '' });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try { setState({ status: 'ready', items: await projectService.listExports(), error: '' }); }
    catch (error) { setState({ status: 'error', items: [], error: projectErrorMessage(error) }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="block" id="exports" aria-labelledby="exports-title">
      <div className="block-head"><h2 id="exports-title">Recent exports</h2></div>
      {state.status === 'loading' && <div className="exports" aria-busy="true"><div className="export-row skeleton"><i className="sk w60" /><i className="sk w40" /></div></div>}
      {state.status === 'error' && (
        <div className="empty compact" role="alert"><p>{state.error}</p><button type="button" className="btn ghost sm" onClick={load}>Try again</button></div>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <div className="empty compact"><span className="empty-icon"><Icon name="download" size={22} /></span><p>Your exports will appear here.</p></div>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="exports">
          {state.items.map((item) => (
            <li className="export-row" key={item.exportId}>
              <span className="file-icon"><Icon name="file" size={20} /></span>
              <div className="file-meta"><b title={item.name}>{item.name}</b><span>{[formatDate(item.createdAt), item.format, item.resolution].filter(Boolean).join(', ')}</span></div>
              {item.downloadUrl && <a className="btn ghost sm" href={item.downloadUrl} download><Icon name="download" size={15} />Download</a>}
              {item.projectId && <Link className="btn ghost sm" to={`/editor/${encodeURIComponent(item.projectId)}`}>Open project</Link>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
