import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService, errorMessage } from '../services/authService.js';
import { Alert, PasswordInput, passwordMessage, passwordScore } from '../components/auth/AuthParts.jsx';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState({ message: '', type: 'error' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const strength = passwordScore(password);

  async function submit(event) {
    event.preventDefault();
    const next = {
      password: passwordMessage(password),
      confirm: !confirm ? 'Please confirm your password.' : confirm !== password ? 'Passwords don’t match yet.' : ''
    };
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true); setAlert({ message: '', type: 'error' });
    try {
      await authService.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (error) {
      setAlert({ message: errorMessage(error), type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return <div className="au"><main className="auth-shell">
    <div className="card narrow">
      <Link to="/" className="mbrand" aria-label="Anwe Studio home"><span className="logo" aria-hidden="true" />Anwe Studio</Link>
      <h3>Choose a new password</h3>
      {!token ? <>
        <Alert message="This reset link is missing its token. Please request a new one." />
        <Link to="/login">Back to log in</Link>
      </> : done ? <>
        <Alert type="ok" message="Password updated! Taking you to log in…" />
        <Link to="/login">Log in now</Link>
      </> : <form onSubmit={submit} noValidate>
        <p className="sub">Pick something strong you haven’t used elsewhere.</p>
        <Alert message={alert.message} type={alert.type} />
        <PasswordInput id="r-pw" label="New password" value={password} autoComplete="new-password"
          placeholder="At least 8 characters" onChange={e => setPassword(e.target.value)} error={errors.password} />
        <div className="strength" aria-hidden="true">{[0, 1, 2, 3].map(index => <i key={index} style={{ background: password && index < strength ? ['#ff8fa3', '#f9a8d4', '#a5b4fc', '#6ee7b7'][strength - 1] : '' }} />)}</div>
        <p className="hint">8+ characters with upper &amp; lower case, a number and a symbol.</p>
        <PasswordInput id="r-pw2" label="Confirm password" value={confirm} autoComplete="new-password"
          placeholder="Repeat your password" onChange={e => setConfirm(e.target.value)} error={errors.confirm} />
        <button className="btn primary" type="submit" disabled={busy}>{busy && <i className="spin" aria-hidden="true" />}{busy ? 'Please wait…' : 'Update password'}</button>
      </form>}
    </div>
  </main></div>;
}
