import { useState } from 'react';
import CutsPanel from './CutsPanel';
import HistoryPanel from './HistoryPanel';
import CropPanel from './CropPanel';
import CleanupPanel from './CleanupPanel';
import CaptionsPanel from './CaptionsPanel';
import HighlightsPanel from './HighlightsPanel';
import { useEditorStore } from '../../store/editorStore';
import { useCleanupStore } from '../../store/cleanupStore';
import { useHighlightStore } from '../../store/highlightStore';
import type { RenderSource } from '../../utils/render';
import '../../styles/editor-ai.css'; // [AI] styles for features 4-6 (no main.jsx change needed)

export type SideTab = 'cuts' | 'history' | 'crop' | 'cleanup' | 'captions' | 'highlights';

interface Props { onSeek: (t: number) => void; initial?: SideTab; projectId: string; name: string; source: RenderSource }

export default function SidePanel({ onSeek, initial = 'cuts', projectId, name, source }: Props) {
  const [tab, setTab] = useState<SideTab>(initial);
  const cuts = useEditorStore((s) => s.runs.length);
  const steps = useEditorStore((s) => s.history.length - 1);
  const cropped = useEditorStore((s) => Boolean(s.doc.crop));
  const suggestions = useCleanupStore((s) => s.suggestions.length);
  const clips = useHighlightStore((s) => s.clips.length);
  const tabs: Array<{ id: SideTab; label: string; badge?: string }> = [
    { id: 'cuts', label: 'Cuts', badge: cuts ? String(cuts) : undefined },
    { id: 'cleanup', label: 'Cleanup', badge: suggestions ? String(suggestions) : undefined },
    { id: 'captions', label: 'Captions' },
    { id: 'highlights', label: 'Highlights', badge: clips ? String(clips) : undefined },
    { id: 'history', label: 'History', badge: steps ? String(steps) : undefined },
    { id: 'crop', label: 'Crop', badge: cropped ? '•' : undefined }
  ];
  return (
    <div className="ed-side card">
      <div className="ed-tabs" role="tablist" aria-label="Edit panels">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} className={`ed-tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}{t.badge && <span className="count">{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className="ed-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'cuts' && <CutsPanel onSeek={onSeek} />}
        {tab === 'cleanup' && <CleanupPanel onSeek={onSeek} />}
        {tab === 'captions' && <CaptionsPanel source={source} name={name} />}
        {tab === 'highlights' && <HighlightsPanel projectId={projectId} name={name} source={source} onSeek={onSeek} />}
        {tab === 'history' && <HistoryPanel />}
        {tab === 'crop' && <CropPanel />}
      </div>
    </div>
  );
}
