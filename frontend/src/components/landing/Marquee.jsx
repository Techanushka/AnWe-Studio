import { features } from "../../data/features.js";

export default function Marquee() {
  const items = features.map((f) => <span key={f.title}>{f.title}</span>);
  return (
    <div className="marq" aria-hidden="true">
      <div className="mt">{items}{features.map((f) => <span key={f.title + "2"}>{f.title}</span>)}</div>
    </div>
  );
}
