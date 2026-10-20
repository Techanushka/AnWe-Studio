import { Link } from "react-router-dom";
import useReveal from "../../hooks/useReveal.js";

export default function FinalCta() {
  const [ref, shown] = useReveal();
  return (
    <div className="wrap">
      <div ref={ref} className={`final rv${shown ? " in" : ""}`}>
        <h2>Your next edit starts with a transcript.</h2>
        <div className="cta">
          <Link className="btn primary lg" to="/signup">Create free account</Link>
          <Link className="btn lg" to="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}
