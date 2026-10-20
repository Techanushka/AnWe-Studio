import { features } from "../../data/features.js";
import FeatureCard from "./FeatureCard.jsx";
import useReveal from "../../hooks/useReveal.js";

export default function Features() {
  const [ref, shown] = useReveal();
  return (
    <section className="features" id="features">
      <div className="wrap">
        <div ref={ref} className={`head rv${shown ? " in" : ""}`}>
          <h2>Everything you need to finish a video faster</h2>
          <p>Ten tools, one editor. Edit from the transcript, let AI handle the busywork, and approve every change before it lands.</p>
        </div>
        <div className="grid">
          {features.map((f, i) => <FeatureCard key={f.title} feature={f} index={i} />)}
        </div>
      </div>
    </section>
  );
}
