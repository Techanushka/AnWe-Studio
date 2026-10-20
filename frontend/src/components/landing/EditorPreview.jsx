import { useEffect, useState } from "react";

const WORDS = "So um today we’re going to, uh, talk about how editing video can feel like writing a document.".split(" ");
const BARS = Array.from({ length: 72 }, (_, i) => 18 + Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23)) * 80);

export default function EditorPreview() {
  const [cut, setCut] = useState(() => new Set());
  const [hint, setHint] = useState("Watch the AI clean up this take…");

  // Auto-cleanup demo: removes the two filler words ("um", "uh")
  useEffect(() => {
    const t1 = setTimeout(() => setCut((c) => new Set(c).add(1)), 2600);
    const t2 = setTimeout(() => {
      setCut((c) => new Set(c).add(6));
      setHint("AI Auto-Cleanup removed 2 filler words. Now try it: click any word to cut it.");
    }, 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const toggle = (i) =>
    setCut((c) => {
      const next = new Set(c);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <div className="editor" aria-label="Interactive editor preview">
      <div className="bar"><b /><b /><b /><span>interview_take2.mp4</span></div>

      <div className="transcript">
        <span className="ts">00:04</span>
        {WORDS.map((w, i) => (
          <span key={i}>
            <button className={`w${cut.has(i) ? " cut" : ""}`} onClick={() => toggle(i)}>{w}</button>{" "}
          </span>
        ))}
      </div>

      <div className="timeline">
        <div className="wave">
          <i className="play" />
          {BARS.map((h, i) => (
            <span
              key={i}
              className={cut.has(Math.floor((i / BARS.length) * WORDS.length)) ? "cut" : ""}
              style={{ height: `${h}%`, animationDelay: `${-(i % 9) * 0.17}s` }}
            />
          ))}
        </div>
        <p className="hint">{hint}</p>
      </div>
    </div>
  );
}
