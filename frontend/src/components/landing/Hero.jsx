import { Fragment } from "react";
import { Link } from "react-router-dom";
import EditorPreview from "./EditorPreview.jsx";

const HEADLINE = "Edit video by editing text.".split(" ");

export default function Hero() {
  return (
    <header className="hero" id="top">
      <div className="wrap">
        <h1>
          {HEADLINE.map((w, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="ww" style={{ animationDelay: `${0.15 + i * 0.14}s` }}>{w}</span>
            </Fragment>
          ))}
        </h1>
        <p>Anwe Studio transcribes your footage so you can cut, clean up, caption and reframe it as easily as editing a document.</p>
        <div className="cta">
          <Link className="btn primary lg" to="/signup">Start editing free</Link>
          <a className="btn lg" href="#features">See all features</a>
        </div>

        <EditorPreview />

        <span className="chip c1">Auto-Cleanup: fillers removed</span>
        <span className="chip c2">9:16 Smart Reframe</span>
        <span className="chip c3">हिंदी subtitles ready</span>
      </div>
    </header>
  );
}
