import Icon from '../dashboard/Icon.jsx';
import { useEditorStore } from '../../store/editorStore';
import { ASPECTS, MAX_ZOOM, cropPixels, defaultCrop } from '../../utils/editModel';
import type { AspectId, Crop } from '../../types/editor';

/** Crop / reframe. The crop is stored as an aspect ratio + zoom + pan, so it works for any video size. */
export default function CropPanel() {
  const crop = useEditorStore((s) => s.doc.crop);
  const size = useEditorStore((s) => s.videoSize);
  const setCrop = useEditorStore((s) => s.setCrop);
  const px = crop && size ? cropPixels(crop, size) : null;
  const slide = (patch: Partial<Crop>) => { if (crop) setCrop({ ...crop, ...patch }, { coalesce: 'crop-slider' }); };

  return (
    <section className="ed-crop" aria-labelledby="crop-h">
      <div className="ed-cuts-head">
        <h2 id="crop-h">Crop</h2>
        <button type="button" className="btn ghost sm" onClick={() => setCrop(null)} disabled={!crop}><Icon name="x" size={15} />Remove crop</button>
      </div>
      <div className="aspects" role="group" aria-label="Aspect ratio">
        <button type="button" className={`aspect${!crop ? ' is-on' : ''}`} onClick={() => setCrop(null)} aria-pressed={!crop}>Original</button>
        {ASPECTS.map((a) => (
          <button key={a.id} type="button" className={`aspect${crop?.aspect === a.id ? ' is-on' : ''}`} aria-pressed={crop?.aspect === a.id} title={a.label}
            onClick={() => setCrop(crop ? { ...crop, aspect: a.id as AspectId } : defaultCrop(a.id))}>{a.id}</button>
        ))}
      </div>
      <div className={`crop-sliders${crop ? '' : ' is-off'}`}>
        <label>Zoom<input type="range" min={1} max={MAX_ZOOM} step={0.05} value={crop?.zoom ?? 1} disabled={!crop} onChange={(e) => slide({ zoom: Number(e.target.value) })} /><output>{(crop?.zoom ?? 1).toFixed(2)}×</output></label>
        <label>Left / right<input type="range" min={0} max={1} step={0.01} value={crop?.panX ?? 0.5} disabled={!crop} onChange={(e) => slide({ panX: Number(e.target.value) })} /><output>{Math.round((crop?.panX ?? 0.5) * 100)}%</output></label>
        <label>Up / down<input type="range" min={0} max={1} step={0.01} value={crop?.panY ?? 0.5} disabled={!crop} onChange={(e) => slide({ panY: Number(e.target.value) })} /><output>{Math.round((crop?.panY ?? 0.5) * 100)}%</output></label>
      </div>
      <p className="muted ed-cuts-empty">{px ? `Output frame: ${px.width} × ${px.height}` : crop ? 'The output size shows once the video has loaded.' : 'Pick an aspect ratio to reframe the video. The original file is never changed.'}</p>
    </section>
  );
}
