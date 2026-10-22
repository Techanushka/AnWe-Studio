import { useEffect, useRef, useState } from 'react';
import { authService, DASHBOARD_URL, errorMessage } from '../../services/authService.js';
import { Alert } from './AuthParts.jsx';

const LENGTH = 6;
const RESEND_SECONDS = 60;

function OtpInput({ value, onChange, disabled, inputRefs }) {
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] || '');
  const focusAt = i => inputRefs.current[Math.max(0, Math.min(i, LENGTH - 1))]?.focus();

  function handleChange(i, event) {
    const typed = event.target.value.replace(/\D/g, '');

    // Box cleared
    if (!typed) {
      onChange(digits.map((d, k) => (k === i ? '' : d)).join(''));
      return;
    }
    // Autofill or multi-digit input
    if (typed.length > 1) {
      const merged = (value.slice(0, i) + typed).slice(0, LENGTH);
      onChange(merged);
      focusAt(merged.length);
      return;
    }
    // Single digit
    onChange(digits.map((d, k) => (k === i ? typed : d)).join(''));
    focusAt(i + 1);
  }

  function handleKey(i, event) {
    if (event.key === 'Backspace' && !digits[i]) focusAt(i - 1);
    if (event.key === 'ArrowLeft') focusAt(i - 1);
    if (event.key === 'ArrowRight') focusAt(i + 1);
  }

  function handlePaste(event) {
    const text = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!text) return;
    event.preventDefault();
    onChange(text);
    focusAt(text.length);
  }

  return (
    <div className="otp" onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={el => { inputRefs.current[i] = el; }}
          className="otp-box"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LENGTH}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onFocus={e => e.target.select()}
        />
      ))}
    </div>
  );
}

// Prefer the backend's own message (e.g. "Invalid or expired code"), because
// errorMessage() maps every 401 to "email or password doesn't match".
function otpErrorMessage(error) {
  return error?.data?.message || errorMessage(error);
}

export default function OtpForm({ email, onBack }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState({ message: '', type: 'error' });
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const inputRefs = useRef([]);
  const submitting = useRef(false); // guards against double submits

  // Focus the first box on mount
  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Auto-submit once all digits are entered
  useEffect(() => {
    if (code.length === LENGTH) verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // After a failed attempt the inputs re-enable and the code is cleared: refocus the first box
  useEffect(() => {
    if (!busy && code === '') inputRefs.current[0]?.focus();
  }, [busy, code]);

  async function verify(event) {
    event?.preventDefault();
    if (submitting.current) return;
    if (code.length < LENGTH) {
      setAlert({ message: `Enter the ${LENGTH}-digit code.`, type: 'error' });
      return;
    }
    submitting.current = true;
    setBusy(true);
    setAlert({ message: '', type: 'error' });
    try {
      await authService.verifyOtp(email, code);
      // Backend has set the auth cookies; go to the dashboard.
      window.location.assign(DASHBOARD_URL);
    } catch (error) {
      setAlert({ message: otpErrorMessage(error), type: 'error' });
      setCode('');
      setBusy(false);
      submitting.current = false;
    }
  }

  async function resend() {
    setAlert({ message: '', type: 'error' });
    try {
      await authService.resendOtp(email);
      setAlert({ message: 'A new code is on its way.', type: 'ok' });
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (error) {
      setAlert({ message: otpErrorMessage(error), type: 'error' });
    }
  }

  return (
    <form onSubmit={verify} noValidate>
      <h3>Verify your email</h3>
      <p className="sub">
        We sent a {LENGTH}-digit code to <b>{email}</b>. It expires in 10 minutes.
      </p>
      <Alert message={alert.message} type={alert.type} />
      <OtpInput value={code} onChange={setCode} disabled={busy} inputRefs={inputRefs} />
      <button className="btn primary" type="submit" disabled={busy || code.length < LENGTH}>
        {busy && <i className="spin" aria-hidden="true" />}
        {busy ? 'Verifying…' : 'Verify & continue'}
      </button>
      <p className="resend">
        {cooldown > 0
          ? `Resend code in ${cooldown}s`
          : <>Didn’t get it? <button type="button" className="link" onClick={resend}>Resend code</button></>}
      </p>
      <p className="resend">
        <button type="button" className="link" onClick={onBack}>Use a different email</button>
      </p>
    </form>
  );
}