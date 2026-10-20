import { useState } from 'react';
import Modal from './Modal.jsx';
import { projectErrorMessage } from '../../services/projectService.js';

export function RenameDialog({ project, onSubmit, onClose }) {
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const value = name.trim();
    if (!value) { setError('Give your project a name.'); return; }
    if (value.length > 80) { setError('Keep the name under 80 characters.'); return; }
    if (value === project.name) { onClose(); return; }
    setBusy(true);
    try { await onSubmit(value); onClose(); }
    catch (err) { setError(projectErrorMessage(err)); setBusy(false); }
  }

  return (
    <Modal titleId="rename-title" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <h2 id="rename-title">Rename project</h2>
        <div className="field">
          <label htmlFor="rename-input">Project name</label>
          <input id="rename-input" data-autofocus type="text" value={name} maxLength={80}
            onChange={(event) => { setName(event.target.value); setError(''); }} aria-invalid={Boolean(error)} />
          {error && <p className="err" role="alert">{error}</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy && <i className="spin" aria-hidden="true" />}Save name</button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteDialog({ project, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    try { await onConfirm(); onClose(); }
    catch (err) { setError(projectErrorMessage(err)); setBusy(false); }
  }

  return (
    <Modal titleId="delete-title" descriptionId="delete-desc" role="alertdialog" onClose={onClose}>
      <h2 id="delete-title">Delete this project?</h2>
      <p id="delete-desc" className="modal-text">“{project.name}” and its edit history will be removed. This can’t be undone.</p>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn ghost" data-autofocus onClick={onClose} disabled={busy}>Keep project</button>
        <button type="button" className="btn danger" onClick={confirm} disabled={busy}>{busy && <i className="spin" aria-hidden="true" />}Delete project</button>
      </div>
    </Modal>
  );
}
