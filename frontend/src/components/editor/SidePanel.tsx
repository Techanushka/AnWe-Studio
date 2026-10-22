import { useState } from 'react';
import CutsPanel from './CutsPanel';
import HistoryPanel from './HistoryPanel';
import CropPanel from './CropPanel';
import { useEditorStore } from '../../store/editorStore';

export type SideTab = 'cuts' | 'history' | 'crop';

export default function SidePanel({ onSeek, initial = 'cuts' }: { onSeek: (t: number) => void; initial?: SideTab }) {
  const [tab, setTab] = useState<SideTab>(initial);
  const cuts = useEditorStore((s) => s.runs.length);
  const steps = useEditorStore((s) => s.history.length - 1);
  const cropped = useEditorStore((s) => Boolean(s.doc.crop));
  const tabs: Array<{ id: SideTab; label: string; badge?: string }> = [
    { id: 'cuts', label: 'Cuts', badge: cuts ? String(cuts) : undefined },
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
        {tab === 'history' && <HistoryPanel />}
        {tab === 'crop' && <CropPanel />}
      </div>
    </div>
  );
}
