import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService, DASHBOARD_URL, errorMessage } from '../services/authService.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function passwordScore(value) {
  return [value.length >= 8, /[a-z]/.test(value) && /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
}
function validateEmail(value) {
  if (!value.trim()) return 'Please enter your email.';
  return emailPattern.test(value.trim()) ? '' : 'That email doesn’t look quite right.';
}
function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function GoogleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.2 1-3.8 1-2.9 0-5.4-2-6.2-4.6H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14a6.6 6.6 0 0 1 0-4V7.2H2.1a11 11 0 0 0 0 9.6z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.2L5.8 10c.8-2.6 3.3-4.6 6.2-4.6z"/></svg>;
}
function PasswordInput({ id, label, value, onChange, placeholder, autoComplete, error, onBlur }) {
  const [visible, setVisible] = useState(false);
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <div className="inp">
      <input id={id} name={id} type={visible ? 'text' : 'password'} value={value}
        onChange={onChange} onBlur={onBlur} placeholder={placeholder} autoComplete={autoComplete}
        aria-invalid={Boolean(error)} />
      <button type="button" className="eye" aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible(!visible)}><EyeIcon /></button>
    </div>
    {error && <p className="err">{error}</p>}
  </div>;
}
function Alert({ message, type = 'error' }) {
  return message ? <div className={`alert ${type}`} role="alert">{message}</div> : null;
}
function GoogleButton({ label, onClick }) {
  return <button className="btn ghost g-btn" type="button" onClick={onClick}><GoogleIcon />{label}</button>;
}
function Brand({ className = '' }) {
  return <Link to="/" className={`brand ${className}`} aria-label="Anwe Studio home"><span className="logo" aria-hidden="true" />Anwe Studio</Link>;
}

export default function AuthPage({ initialMode = 'login' }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode);
  const [forgotMode, setForgotMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ message: '', type: 'error' });
  const [errors, setErrors] = useState({});
  const [login, setLogin] = useState({ email: '', password: '', remember: false });
  const [signup, setSignup] = useState({ name: '', email: '', password: '', confirm: '', terms: false });
  const [forgotEmail, setForgotEmail] = useState('');
  const strength = passwordScore(signup.password);

  // Keep the form in sync with the URL (/login or /signup)
  useEffect(() => {
    setMode(initialMode); setForgotMode(false); setErrors({}); setAlert({ message: '', type: 'error' });
  }, [initialMode]);

  useEffect(() => {
    authService.me().then(user => { if (user) window.location.replace(DASHBOARD_URL); });
  }, []);

  function switchMode(nextMode) {
    navigate(nextMode === 'signup' ? '/signup' : '/login');
    setMode(nextMode);
    setForgotMode(false);
    setAlert({ message: '', type: 'error' });
    setErrors({});
  }
  function setError(key, message) {
    setErrors(previous => ({ ...previous, [key]: message }));
    return !message;
  }
  function showServiceError(error) {
    setAlert({ message: errorMessage(error), type: 'error' });
  }
  async function submitRequest(event, validate, request, onSuccess) {
    event.preventDefault();
    setAlert({ message: '', type: 'error' });
    if (!validate()) return;
    setBusy(true);
    try {
      await request();
      onSuccess();
    } catch (error) {
      showServiceError(error);
    } finally {
      setBusy(false);
    }
  }
  function validateLogin() {
    const emailOk = setError('loginEmail', validateEmail(login.email));
    const passwordOk = setError('loginPassword', login.password ? '' : 'Please enter your password.');
    return emailOk && passwordOk;
  }
  function validateSignup() {
    const nameOk = setError('name', signup.name.trim() ? '' : 'Please tell us your name.');
    const emailOk = setError('signupEmail', validateEmail(signup.email));
    const passwordMessage = !signup.password ? 'Please create a password.' : signup.password.length < 8 ? 'Use at least 8 characters.' : strength < 3 ? 'Add upper & lower case letters, a number or a symbol.' : '';
    const passwordOk = setError('signupPassword', passwordMessage);
    const confirmOk = setError('confirm', !signup.confirm ? 'Please confirm your password.' : signup.confirm !== signup.password ? 'Passwords don’t match yet.' : '');
    const termsOk = setError('terms', signup.terms ? '' : 'Please accept the Terms and Privacy Policy to continue.');
    return nameOk && emailOk && passwordOk && confirmOk && termsOk;
  }
  function googleSignIn() {
    try { authService.google(); } catch (error) { showServiceError(error); }
  }

  return <div className="au"><main className="auth-shell">
    <div className={`card auth-card ${mode === 'signup' ? 'signup' : ''}`}>
      <Link to="/" className="mbrand" aria-label="Anwe Studio home"><span className="logo" aria-hidden="true" />Anwe Studio</Link>
      <div className="mtabs" role="tablist" aria-label="Authentication">
        <button role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>Log In</button>
        <button role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')}>Sign Up</button>
      </div>

      <section className="panel p-login" aria-label="Log in">
        <h3>{forgotMode ? 'Reset your password' : 'Welcome back'}</h3>
        <p className="sub">{forgotMode ? 'We’ll email you a link to reset your password.' : 'Log in to pick up where you left off.'}</p>
        <Alert message={alert.message} type={alert.type} />
        {!forgotMode ? <>
          <form onSubmit={event => submitRequest(event, validateLogin,
            () => authService.login(login.email.trim(), login.password, login.remember),
            () => window.location.assign(DASHBOARD_URL))} noValidate>
            <div className="field"><label htmlFor="l-email">Email address</label>
              <input id="l-email" type="email" autoComplete="email" placeholder="you@example.com" value={login.email}
                onChange={event => setLogin({ ...login, email: event.target.value })}
                onBlur={() => login.email && setError('loginEmail', validateEmail(login.email))}
                aria-invalid={Boolean(errors.loginEmail)} />
              {errors.loginEmail && <p className="err">{errors.loginEmail}</p>}
            </div>
            <PasswordInput id="l-pw" label="Password" value={login.password} autoComplete="current-password" placeholder="Your password"
              onChange={event => setLogin({ ...login, password: event.target.value })} error={errors.loginPassword}
              onBlur={() => login.password && setError('loginPassword', '')} />
            <div className="row"><label className="check"><input type="checkbox" checked={login.remember} onChange={event => setLogin({ ...login, remember: event.target.checked })} />Remember me</label>
              <button type="button" className="link" onClick={() => { setForgotMode(true); setAlert({ message: '', type: 'error' }); setForgotEmail(login.email); }}>Forgot password?</button></div>
            <button className="btn primary" type="submit" disabled={busy}>{busy && <i className="spin" aria-hidden="true" />}{busy ? 'Please wait…' : 'Log In'}</button>
          </form>
          <div className="google"><div className="divider">or continue with</div><GoogleButton label="Continue with Google" onClick={googleSignIn} /></div>
        </> : <>
          <form onSubmit={event => submitRequest(event, () => setError('forgotEmail', validateEmail(forgotEmail)),
            () => authService.forgotPassword(forgotEmail.trim()),
            () => setAlert({ message: 'If that email has an account, a reset link is on its way.', type: 'ok' }))} noValidate>
            <div className="field"><label htmlFor="f-email">Email address</label><input id="f-email" type="email" autoComplete="email" placeholder="you@example.com"
              value={forgotEmail} onChange={event => setForgotEmail(event.target.value)} aria-invalid={Boolean(errors.forgotEmail)} />
              {errors.forgotEmail && <p className="err">{errors.forgotEmail}</p>}</div>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Send reset link'}</button>
            <p style={{ textAlign: 'center', margin: '14px 0 0' }}><button type="button" className="link" onClick={() => switchMode('login')}>Back to log in</button></p>
          </form>
        </>}
      </section>

      <section className="panel p-signup" aria-label="Sign up">
        <h3>Create your account</h3><p className="sub">Start editing video as easily as editing text.</p>
        <Alert message={alert.message} type={alert.type} />
        <form onSubmit={event => submitRequest(event, validateSignup,
          () => authService.signup(signup.name.trim(), signup.email.trim(), signup.password),
          () => window.location.assign(DASHBOARD_URL))} noValidate>
          <div className="field"><label htmlFor="s-name">Full name</label><input id="s-name" type="text" autoComplete="name" placeholder="Alex Rivera"
            value={signup.name} onChange={event => setSignup({ ...signup, name: event.target.value })} aria-invalid={Boolean(errors.name)} />
            {errors.name && <p className="err">{errors.name}</p>}</div>
          <div className="field"><label htmlFor="s-email">Email address</label><input id="s-email" type="email" autoComplete="email" placeholder="you@example.com"
            value={signup.email} onChange={event => setSignup({ ...signup, email: event.target.value })} aria-invalid={Boolean(errors.signupEmail)} />
            {errors.signupEmail && <p className="err">{errors.signupEmail}</p>}</div>
          <PasswordInput id="s-pw" label="Password" value={signup.password} autoComplete="new-password" placeholder="At least 8 characters"
            onChange={event => setSignup({ ...signup, password: event.target.value })} error={errors.signupPassword} />
          <div className="strength" aria-hidden="true">{[0, 1, 2, 3].map(index => <i key={index} style={{ background: signup.password && index < strength ? ['#ff8fa3', '#f9a8d4', '#a5b4fc', '#6ee7b7'][strength - 1] : '' }} />)}</div>
          <p className="hint">8+ characters with upper &amp; lower case, a number and a symbol.</p>
          <PasswordInput id="s-pw2" label="Confirm password" value={signup.confirm} autoComplete="new-password" placeholder="Repeat your password"
            onChange={event => setSignup({ ...signup, confirm: event.target.value })} error={errors.confirm}
            onBlur={() => signup.confirm && setError('confirm', signup.confirm === signup.password ? '' : 'Passwords don’t match yet.')} />
          <div className="field"><label className="check"><input type="checkbox" checked={signup.terms} onChange={event => setSignup({ ...signup, terms: event.target.checked })} />
            <span>I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</span></label>
            {errors.terms && <p className="err">{errors.terms}</p>}</div>
          <button className="btn primary" type="submit" disabled={busy}>{busy && <i className="spin" aria-hidden="true" />}{busy ? 'Please wait…' : 'Create Account'}</button>
        </form>
        <div className="google"><div className="divider">or sign up with</div><GoogleButton label="Sign up with Google" onClick={googleSignIn} /></div>
      </section>

      <aside className="overlay" aria-label="Anwe Studio">
        <span className="star" style={{ top: 26, right: 30, fontSize: 16 }}>✦</span>
        <span className="star" style={{ top: 60, right: 60, fontSize: 10, color: 'var(--mint)', animationDelay: '1s' }}>✦</span>
        <Brand />
        <div className="ov ov-login">
          <h2>Your next great edit starts here.</h2>
          <p>Sign in to continue creating, or join us to turn long videos into polished, shareable stories.</p>
          <div className="mini" aria-hidden="true"><div className="tx"><b>So</b> <s>um</s> here’s the <mark>big idea</mark> <s>uh</s> we edit the text.</div>
            <div className="wave">{Array.from({ length: 36 }, (_, index) => <i key={index} style={{ '--h': `${20 + Math.abs(Math.sin(index * 1.3) * 80)}%` }} />)}</div>
            <div className="tl"><span style={{ '--w': 3, '--c': '#8b7cff' }} /><span style={{ '--w': 1, '--c': '#f9a8d4' }} /><span style={{ '--w': 2, '--c': '#5eead4' }} /><span style={{ '--w': 2, '--c': '#8b7cff' }} /></div>
          </div>
          <div className="chips"><span className="chip">✦ Edit through text</span><span className="chip">✧ AI best moments</span><span className="chip">▣ Captions &amp; clips</span></div>
          <button className="btn outline" type="button" onClick={() => switchMode('signup')}>New here? Sign up</button>
        </div>
        <div className="ov ov-signup">
          <h2>Good to see you again.</h2><p>Your transcripts, clips and captions are right where you left them.</p>
          <div className="chips"><span className="chip">✦ Edit through text</span><span className="chip">✧ AI best moments</span></div>
          <button className="btn outline" type="button" onClick={() => switchMode('login')}>Have an account? Log in</button>
        </div>
      </aside>
    </div>
  </main></div>;
}
