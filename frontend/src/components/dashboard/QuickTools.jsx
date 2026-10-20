import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

const TOOLS = [
  { panel: 'transcript', icon: 'text', color: '#8b7cff', title: 'Transcript Editor', text: 'Edit your video by editing words and sentences.' },
  { panel: 'timeline', icon: 'timeline', color: '#5eead4', title: 'Video Timeline', text: 'Preview footage, navigate the timeline and manage cuts.' },
  { panel: 'history', icon: 'history', color: '#f9a8d4', title: 'Edit History', text: 'Undo and redo your recent editing actions.' }
];
const PLANNED = ['AI cleanup', 'Highlights', 'Speaker detection', 'Smart reframing', 'Multilingual captions'];

export default function QuickTools({ projects, loading }) {
  // Prefer the most recently edited project that has finished processing; fall back to any project.
  const byRecent = [...projects].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const latest = byRecent.find((p) => p.status !== 'processing') || byRecent[0];

  return (
    <section className="block" aria-labelledby="tools-title">
      <div className="block-head"><h2 id="tools-title">Jump back into editing</h2></div>
      <div className="tools">
        {TOOLS.map((tool) => {
          const inner = (
            <>
              <span className="tool-icon" style={{ '--c': tool.color }}><Icon name={tool.icon} size={20} /></span>
              <b>{tool.title}</b>
              <span className="tool-text">{tool.text}</span>
              <span className="tool-go">{loading ? 'Checking your projects…' : latest ? `Open in “${latest.name}”` : 'Create a project first'}</span>
            </>
          );
          return loading
            ? <div className="tool is-loading" key={tool.panel} aria-busy="true">{inner}</div>
            : <Link key={tool.panel} className="tool" style={{ '--c': tool.color }} to={latest ? `/editor/${encodeURIComponent(latest.projectId)}?panel=${tool.panel}` : '/projects/new'}>{inner}</Link>;
        })}
      </div>
      <p className="planned"><span>Not available yet:</span>{PLANNED.map((item) => <span className="planned-chip" key={item}>{item}</span>)}</p>
    </section>
  );
}
