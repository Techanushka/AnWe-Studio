import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { usePlayhead } from '../../store/playheadStore';
import { useCaptionStore } from '../../store/captionStore';
import { FONTS, activeWord, buildCaptionLines, hexToRgba, lineAt } from '../../utils/captions';

/**
 * Live caption preview (Feature 5). Rendered INSIDE .ed-stage so it sits on top of the (cropped) video, just
 * like the exported file. It follows the playhead; React only re-renders when the line or the word changes.
 */
export default function CaptionOverlay() {
  const style = useCaptionStore((s) => s.style);
  const words = useEditorStore((s) => s.words);
  const captions = useEditorStore((s) => s.doc.captions);
  const keep = useEditorStore((s) => s.keep);
  const lines = useMemo(() => (style.enabled ? buildCaptionLines(words, captions, keep, style.maxWords) : []), [style.enabled, style.maxWords, words, captions, keep]);
  const li = usePlayhead((s) => lineAt(lines, s.time));
  const wi = usePlayhead((s) => { const k = lineAt(lines, s.time); return k < 0 ? -1 : activeWord(lines[k], s.time); });

  const ref = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setBase(Math.min(el.clientWidth, el.clientHeight));
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const line = li >= 0 ? lines[li] : null;
  const boxed = style.bgOpacity > 0.02;
  return (
    <div className="cap-layer" ref={ref} aria-hidden="true">
      {line && (
        <div className={`cap-box pos-${style.position}${boxed ? '' : ' no-bg'}`}
          style={{ fontSize: base * (style.sizePct / 100), fontFamily: FONTS[style.font].css, color: style.color, background: boxed ? hexToRgba(style.bg, style.bgOpacity) : undefined }}>
          {line.words.map((w, k) => {
            const on = style.wordHighlight && k === wi;
            const t = style.uppercase ? w.text.toUpperCase() : w.text;
            return <span key={w.i} className={`cap-w${on ? ' on' : ''}`} style={on ? { color: style.highlight } : undefined}>{t}{k < line.words.length - 1 ? ' ' : ''}</span>;
          })}
        </div>
      )}
    </div>
  );
}
