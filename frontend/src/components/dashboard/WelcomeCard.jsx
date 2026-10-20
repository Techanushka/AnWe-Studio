import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

const BARS = Array.from({ length: 40 }, (_, i) => 20 + Math.abs(Math.sin(i * 1.3) * 80));

export default function WelcomeCard() {
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-copy">
        <h2 id="welcome-title">Your creative workspace</h2>
        <p>Turn your videos into stories, one edit at a time.</p>
        <div className="cta-row">
          <Link to="/projects/new" className="btn primary"><Icon name="plus" size={17} />Create New Project</Link>
          <Link to={{ pathname: '/dashboard', hash: '#projects' }} className="btn outline">Explore My Projects</Link>
        </div>
      </div>
      <div className="mini" aria-hidden="true">
        <div className="mini-video"><Icon name="play" size={22} /><span>interview_take2.mp4</span></div>
        <div className="mini-tx"><b>So</b> <s>um</s> here’s the <mark>big idea</mark> <s>uh</s> we edit the text.</div>
        <div className="mini-wave">{BARS.map((h, i) => <i key={i} style={{ '--h': `${h}%` }} />)}</div>
        <div className="mini-tl"><span style={{ '--w': 3, '--c': '#8b7cff' }} /><span style={{ '--w': 1, '--c': '#f9a8d4' }} /><span style={{ '--w': 2, '--c': '#5eead4' }} /><span style={{ '--w': 2, '--c': '#8b7cff' }} /></div>
      </div>
    </section>
  );
}
