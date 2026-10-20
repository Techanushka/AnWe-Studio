import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/dashboard/Icon.jsx';

const PANELS = { transcript: 'Transcript Editor', timeline: 'Video Timeline', history: 'Edit History' };

/**
 * PLACEHOLDER. The editor hasn't been built in this frontend yet.
 * Replace this route's element in App.jsx with the real editor; it receives :projectId
 * and an optional ?panel=transcript|timeline|history query for the Quick Tools shortcuts.
 */
export default function EditorPlaceholderPage() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const panel = PANELS[params.get('panel')];
  useEffect(() => { document.title = 'Editor – Anwe Studio'; }, []);

  return (
    <div className="page narrow">
      <div className="empty">
        <span className="empty-icon"><Icon name="film" size={26} /></span>
        <h1 className="empty-h">The editor isn’t built yet</h1>
        <p>Project <code>{projectId}</code>{panel ? <> would open on <b>{panel}</b></> : null}. This page only confirms that the dashboard routed here correctly; it doesn’t load or edit any video.</p>
        <Link to="/dashboard" className="btn primary">Back to dashboard</Link>
      </div>
    </div>
  );
}
