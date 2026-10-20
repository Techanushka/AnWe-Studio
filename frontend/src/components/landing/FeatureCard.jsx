import useReveal from "../../hooks/useReveal.js";

export default function FeatureCard({ feature, index }) {
  const [ref, shown] = useReveal();

  // Cursor-following glow
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <article
      ref={ref}
      onPointerMove={onMove}
      className={`card ${feature.size} rv${shown ? " in" : ""}`}
      style={{ "--c": feature.color, transitionDelay: `${(index % 3) * 0.09}s` }}
    >
      <div className="tag">{feature.group}</div>
      <h3>{feature.title}</h3>
      <p>{feature.desc}</p>
      <ul>
        {feature.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </article>
  );
}
