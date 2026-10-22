import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService, DASHBOARD_URL, errorMessage } from '../services/authService.js';
import { Alert, Brand, GoogleButton, PasswordInput, passwordMessage, passwordScore, validateEmail } from '../components/auth/AuthParts.jsx';
import OtpForm from '../components/auth/OtpForm.jsx';

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
  const [searchParams] = useSearchParams();
  const [verifyEmail, setVerifyEmail] = useState(null);

  // Keep the form in sync with the URL (/login or /signup)
  useEffect(() => {
    setMode(initialMode);
    setForgotMode(false);
    setVerifyEmail(null);
    setErrors({});
    setAlert({ message: '', type: 'error' });
  }, [initialMode]);

  useEffect(() => {
    if (searchParams.get('error') === 'google_failed') {
      setAlert({ message: 'Google sign-in didn’t work. Please try again or use your email.', type: 'error' });
    }
  }, [searchParams]);

  useEffect(() => {
    authService.me().then(user => { if (user) window.location.replace(DASHBOARD_URL); });
  }, []);

  function switchMode(nextMode) {
    navigate(nextMode === 'signup' ? '/signup' : '/login');
    setMode(nextMode);
    setForgotMode(false);
    setAlert({ message: '', type: 'error' });
    setErrors({});
    setVerifyEmail(null);
  }

  function setError(key, message) {
    setErrors(previous => ({ ...previous, [key]: message }));
    return !message;
  }

  function showServiceError(error) {
    if (error.code === 'EMAIL_NOT_VERIFIED') { // backend already emailed a fresh code
      const fallback = (mode === 'signup' ? signup.email : login.email).trim().toLowerCase();
      setVerifyEmail(error.data?.email || fallback);
      return;
    }
    setAlert({ message: errorMessage(error), type: 'error' });
  }

  async function submitRequest(event, validate, request, onSuccess) {
    event.preventDefault();
    setAlert({ message: '', type: 'error' });
    if (!validate()) return;
    setBusy(true);
    try {
      const result = await request();
      onSuccess(result);
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
    const passwordOk = setError('signupPassword', passwordMessage(signup.password));
    const confirmOk = setError('confirm', !signup.confirm ? 'Please confirm your password.' : signup.confirm !== signup.password ? 'Passwords don’t match yet.' : '');
    const termsOk = setError('terms', signup.terms ? '' : 'Please accept the Terms and Privacy Policy to continue.');
    return nameOk && emailOk && passwordOk && confirmOk && termsOk;
  }

  function googleSignIn() {
    try { authService.google(); } catch (error) { showServiceError(error); }
  }

  const verifyingLogin = Boolean(verifyEmail) && mode === 'login';
  const verifyingSignup = Boolean(verifyEmail) && mode === 'signup';

  return <div className="au"><main className="auth-shell">
    <div className={`card auth-card ${mode === 'signup' ? 'signup' : ''}`}>
      <Link to="/" className="mbrand" aria-label="Anwe Studio home"><span className="logo" aria-hidden="true" />Anwe Studio</Link>
      <div className="mtabs" role="tablist" aria-label="Authentication">
        <button role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>Log In</button>
        <button role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')}>Sign Up</button>
      </div>

      <section className="panel p-login" aria-label="Log in">
        {verifyingLogin ? (
          <OtpForm email={verifyEmail} onBack={() => setVerifyEmail(null)} />
        ) : (<>
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
        </>)}
      </section>

      <section className="panel p-signup" aria-label="Sign up">
        {verifyingSignup ? (
          <OtpForm email={verifyEmail} onBack={() => setVerifyEmail(null)} />
        ) : (<>
          <h3>Create your account</h3><p className="sub">Start editing video as easily as editing text.</p>
          <Alert message={alert.message} type={alert.type} />
          <form onSubmit={event => submitRequest(event, validateSignup,
            () => authService.signup(signup.name.trim(), signup.email.trim(), signup.password),
            result => setVerifyEmail(result?.email || signup.email.trim().toLowerCase()))} noValidate>
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
        </>)}
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