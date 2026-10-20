import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import VideoUploadCard from '../components/dashboard/VideoUploadCard.jsx';
import Icon from '../components/dashboard/Icon.jsx';

export default function NewProjectPage() {
  useEffect(() => { document.title = 'New project – Anwe Studio'; }, []);
  return (
    <div className="page narrow">
      <Link to="/dashboard" className="back"><Icon name="chevronLeft" size={16} />Back to dashboard</Link>
      <header className="db-header solo">
        <div className="greet"><h1>Create a new project</h1><p>Choose the recording you want to edit.</p></div>
      </header>
      <VideoUploadCard />
    </div>
  );
}
