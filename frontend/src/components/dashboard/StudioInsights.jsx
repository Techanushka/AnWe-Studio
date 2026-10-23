import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { API_CONFIGURED } from '../../services/authService.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function post(path, body = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.message || `Request failed (${response.status})`);
  return data;
}

function prettyDuration(seconds) {
  const minutes = Math.round((Number(seconds) || 0) / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function StudioInsights({ projects = [] }) {
  const [analytics, setAnalytics] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState([]);
  const [command, setCommand] = useState('Remove pauses longer than 2 seconds');
  const [proposal, setProposal] = useState(null);
  const [notice, setNotice] = useState('');

  const fallbackAnalytics = useMemo(() => {
    const duration = projects.reduce((sum, p) => sum + (Number(p.duration) || 0), 0);
    return {
      total_projects: projects.length,
      completed_transcriptions: projects.filter((p) => p.status === 'ready').length,
      media_hours_processed: Math.round(duration / 3600 * 100) / 100,
      estimated_time_saved_minutes: Math.round(duration / 60 * 2),
      processing: projects.filter((p) => p.status === 'processing').length,
      failed: projects.filter((p) => p.status === 'failed').length,
      pending: projects.filter((p) => p.status === 'draft').length,
      completed: projects.filter((p) => p.status === 'ready').length,
      time_saved_assumption: 'Estimate assumes 2 minutes saved per media minute; it is not a measured result.'
    };
  }, [projects]);

  useEffect(() => {
    if (!API_CONFIGURED) return;
    let alive = true;
    fetch(`${API_BASE}/dashboard/analytics`, { credentials: 'include' })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.detail || 'Analytics unavailable'); return d; })
      .then((data) => alive && setAnalytics(data)).catch(() => {}) ;
    return () => { alive = false; };
  }, [projects.length]);

  useEffect(() => {
    if (!selectedId && projects.length) setSelectedId(projects[0].projectId);
    if (selectedId && !projects.some((p) => p.projectId === selectedId)) setSelectedId(projects[0]?.projectId || '');
  }, [projects, selectedId]);

  const stats = analytics || fallbackAnalytics;
  const selectedProject = projects.find((p) => p.projectId === selectedId);

  async function runSummary() {
    if (!selectedId) return;
    setLoading(true); setError(''); setNotice('');
    try { setSummary(await post(`/projects/${encodeURIComponent(selectedId)}/ai/summary`)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function askQuestion(event) {
    event.preventDefault();
    if (!question.trim() || !selectedId) return;
    const prompt = question.trim(); setQuestion(''); setLoading(true); setError(''); setNotice('');
    setChat((old) => [...old, { role: 'user', text: prompt }]);
    try {
      const result = await post(`/projects/${encodeURIComponent(selectedId)}/ai/chat`, { question: prompt });
      setChat((old) => [...old, { role: 'assistant', text: result.answer, provider: result.provider }]);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function createProposal(event) {
    event.preventDefault();
    if (!command.trim() || !selectedId) return;
    setLoading(true); setError(''); setNotice(''); setProposal(null);
    try { setProposal(await post(`/projects/${encodeURIComponent(selectedId)}/ai/edit-proposal`, { command: command.trim() })); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function approveProposal() {
    if (!proposal || !selectedId) return;
    setLoading(true); setError('');
    try {
      const result = await post(`/projects/${encodeURIComponent(selectedId)}/ai/apply-edit`, { proposal });
      setNotice(result.message || 'Edit plan saved to this project.');
      setProposal(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <section className="studio-insights block" aria-labelledby="insights-title">
      <div className="block-head">
        <div><h2 id="insights-title">Studio overview</h2><p className="block-sub">Your workload, progress and AI workspace in one place.</p></div>
        <span className="insights-badge"><Icon name="sparkles" size={15} /> AI Studio</span>
      </div>

      <div className="analytics-grid">
        <article className="analytics-card"><span className="analytics-icon violet"><Icon name="folder" size={19} /></span><span className="analytics-label">Total projects</span><strong>{stats.total_projects ?? projects.length}</strong><small>Across your workspace</small></article>
        <article className="analytics-card"><span className="analytics-icon mint"><Icon name="check" size={19} /></span><span className="analytics-label">Transcriptions</span><strong>{stats.completed_transcriptions ?? stats.completed ?? 0}</strong><small>Projects with transcript / ready status</small></article>
        <article className="analytics-card"><span className="analytics-icon pink"><Icon name="clock" size={19} /></span><span className="analytics-label">Media processed</span><strong>{Number(stats.media_hours_processed || 0).toFixed(2)}h</strong><small>Total known media duration</small></article>
        <article className="analytics-card"><span className="analytics-icon amber"><Icon name="zap" size={19} /></span><span className="analytics-label">Estimated time saved</span><strong>{prettyDuration((stats.estimated_time_saved_minutes || 0) * 60)}</strong><small title={stats.time_saved_assumption}>Heuristic estimate ⓘ</small></article>
      </div>
      <div className="job-status-row" aria-label="Project statuses">
        <span><i className="status-dot done" />Completed <b>{stats.completed ?? 0}</b></span>
        <span><i className="status-dot running" />Processing <b>{stats.processing ?? 0}</b></span>
        <span><i className="status-dot waiting" />Pending <b>{stats.pending ?? 0}</b></span>
        <span><i className="status-dot failed" />Failed <b>{stats.failed ?? 0}</b></span>
      </div>
      <p className="analytics-note">Time saved is an estimate (2 minutes saved per media minute), not a measured benchmark. Dashboard metrics reflect saved server data when connected; otherwise they are calculated from the current project list. {stats.job_tracking_note || 'Processing and failed counts depend on the status values available in your project data.'}</p>

      <div className="ai-workspace">
        <div className="ai-workspace-head">
          <div><span className="eyebrow"><Icon name="brain" size={14} /> AI-POWERED WORKSPACE</span><h3>Turn transcripts into useful work</h3><p>Summarize recordings, ask questions, or preview an edit plan before approving it.</p></div>
          <label className="ai-project-select">Project<select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setSummary(null); setChat([]); setProposal(null); setError(''); setNotice(''); }} disabled={!projects.length}><option value="">Choose a project</option>{projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.name}</option>)}</select></label>
        </div>
        <div className="ai-tabs" role="tablist" aria-label="AI tools">
          <button className={mode === 'summary' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'summary'} onClick={() => setMode('summary')}><Icon name="file" size={16} /> Summary</button>
          <button className={mode === 'chat' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'chat'} onClick={() => setMode('chat')}><Icon name="help" size={16} /> Ask transcript</button>
          <button className={mode === 'edit' ? 'active' : ''} type="button" role="tab" aria-selected={mode === 'edit'} onClick={() => setMode('edit')}><Icon name="scissors" size={16} /> Edit assistant</button>
        </div>

        {!API_CONFIGURED && <div className="ai-callout"><Icon name="alert" size={18} /><div><b>Backend connection required</b><p>Set <code>VITE_API_BASE_URL</code> and run the FastAPI backend to use AI endpoints. For Gemini-powered semantic answers and translation, add <code>GEMINI_API_KEY</code> to <code>backend/.env</code>. Never put that key in frontend env files.</p></div></div>}
        {API_CONFIGURED && !projects.length && <div className="ai-empty">Create a project and finish its transcription to use AI Studio.</div>}
        {API_CONFIGURED && projects.length > 0 && selectedProject && (
          <>
            {mode === 'summary' && <div className="ai-pane">
              <div className="ai-pane-copy"><b>AI summary & action items</b><p>Generate a concise overview, takeaways, quotes, decisions and follow-ups from the saved transcript.</p></div>
              <button type="button" className="btn primary" disabled={loading} onClick={runSummary}>{loading ? <><i className="spin" /> Working…</> : <><Icon name="sparkles" size={16} /> Generate summary</>}</button>
              {summary && <div className="ai-result"><span className="result-meta">Generated with {summary.provider === 'gemini' ? 'Gemini' : 'local extractive analysis'}</span><h4>Summary</h4><p>{summary.summary}</p>{[['Key takeaways', summary.key_takeaways], ['Important quotes', summary.important_quotes], ['Action items', summary.action_items], ['Decisions', summary.decisions]].map(([title, items]) => items?.length ? <div key={title}><h4>{title}</h4><ul>{items.map((item, i) => <li key={`${title}-${i}`}>{item}</li>)}</ul></div> : null)}</div>}
            </div>}
            {mode === 'chat' && <div className="ai-pane">
              <div className="ai-pane-copy"><b>Ask questions about your recording</b><p>Answers use the saved transcript. Gemini adds semantic reasoning and timestamp citations; fallback mode searches matching words.</p></div>
              <div className="chat-history" aria-live="polite">{chat.length === 0 ? <p className="chat-empty">Try: “What are the main points?” or “When did they discuss pricing?”</p> : chat.map((item, i) => <div className={`chat-message ${item.role}`} key={`${i}-${item.role}`}><b>{item.role === 'user' ? 'You' : 'AnWe AI'}</b><p>{item.text}</p></div>)}{loading && <p className="chat-loading"><i className="spin" /> Thinking…</p>}</div>
              <form className="ai-chat-form" onSubmit={askQuestion}><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask something about this transcript…" maxLength={2000} aria-label="Question about transcript" /><button className="btn primary" type="submit" disabled={loading || !question.trim()}><Icon name="play" size={15} /> Ask</button></form>
            </div>}
            {mode === 'edit' && <div className="ai-pane">
              <div className="ai-pane-copy"><b>Natural-language editing assistant</b><p>Describe the edit. AnWe will propose structured operations first; nothing is applied until you approve.</p></div>
              <form className="ai-command-form" onSubmit={createProposal}><label htmlFor="ai-command">What should I change?</label><textarea id="ai-command" value={command} onChange={(e) => setCommand(e.target.value)} rows={3} maxLength={1200} placeholder="e.g. Create 3 highlights from this lecture" /><div className="command-examples"><button type="button" onClick={() => setCommand('Remove pauses longer than 2 seconds')}>Remove long pauses</button><button type="button" onClick={() => setCommand('Create 3 highlights from this recording')}>Create 3 highlights</button><button type="button" onClick={() => setCommand('Generate Hindi subtitles')}>Hindi subtitles</button><button type="button" onClick={() => setCommand('Make this clip vertical')}>Make vertical</button></div><button type="submit" className="btn primary" disabled={loading || !command.trim()}>{loading ? <><i className="spin" /> Planning…</> : <><Icon name="sparkles" size={16} /> Preview edit plan</>}</button></form>
              {proposal && <div className="proposal-card"><div className="proposal-head"><h4>{proposal.title || 'Proposed edit plan'}</h4><span className="approval-pill">Approval required</span></div><p className="proposal-command">“{proposal.command}”</p>{proposal.operations?.map((op, i) => <div className="operation" key={`${op.type}-${i}`}><b>{op.type.replaceAll('_', ' ')}</b>{op.threshold_seconds != null && <p>Cut pauses longer than {op.threshold_seconds} seconds. {op.count ?? op.cuts?.length ?? 0} candidate gap(s) found.</p>}{op.items && <ul>{op.items.map((item, j) => <li key={j}>[{Number(item.start).toFixed(1)}s–{Number(item.end).toFixed(1)}s] {item.text}</li>)}</ul>}{op.ratio && <p>Suggested aspect ratio: {op.ratio}. {op.note}</p>}{op.target_language && <p>Target language: {op.target_language}. {op.note}</p>}{op.note && !op.ratio && !op.target_language && <p>{op.note}</p>}</div>)}<p className="proposal-warning"><Icon name="alert" size={15} /> Approval saves the edit plan to project metadata. Actual video rendering/cropping and translated subtitle generation require their corresponding processing/export steps.</p><div className="proposal-actions"><button type="button" className="btn ghost" onClick={() => setProposal(null)}>Discard</button><button type="button" className="btn primary" onClick={approveProposal} disabled={loading}>Approve & save plan</button></div></div>}
            </div>}
          </>
        )}
        {error && <div className="ai-error" role="alert"><Icon name="alert" size={16} />{error}</div>}
        {notice && <div className="ai-success" role="status"><Icon name="check" size={16} />{notice}</div>}
      </div>
    </section>
  );
}
