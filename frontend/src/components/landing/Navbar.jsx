import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav>
      <div className="wrap">
        <a className="logo" href="#top"><i />Anwe Studio</a>
        <div className="links"><a href="#features">Features</a></div>
        <div className="auth">
          <Link className="btn" to="/login">Log in</Link>
          <Link className="btn primary" to="/signup">Sign up</Link>
        </div>
      </div>
    </nav>
  );
}
