import { useState } from 'react';
import { Link } from 'react-router-dom';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function passwordScore(value) {
  return [value.length >= 8, /[a-z]/.test(value) && /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
}
export function passwordMessage(value) {
  if (!value) return 'Please create a password.';
  if (value.length < 8) return 'Use at least 8 characters.';
  if (passwordScore(value) < 3) return 'Add upper & lower case letters, a number or a symbol.';
  return '';
}
export function validateEmail(value) {
  if (!value.trim()) return 'Please enter your email.';
  return emailPattern.test(value.trim()) ? '' : 'That email doesn’t look quite right.';
}

export function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>;
}
export function GoogleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.2 1-3.8 1-2.9 0-5.4-2-6.2-4.6H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14a6.6 6.6 0 0 1 0-4V7.2H2.1a11 11 0 0 0 0 9.6z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.1 7.2L5.8 10c.8-2.6 3.3-4.6 6.2-4.6z"/></svg>;
}
export function PasswordInput({ id, label, value, onChange, placeholder, autoComplete, error, onBlur }) {
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
export function Alert({ message, type = 'error' }) {
  return message ? <div className={`alert ${type}`} role="alert">{message}</div> : null;
}
export function GoogleButton({ label, onClick }) {
  return <button className="btn ghost g-btn" type="button" onClick={onClick}><GoogleIcon />{label}</button>;
}
export function Brand({ className = '' }) {
  return <Link to="/" className={`brand ${className}`} aria-label="Anwe Studio home"><span className="logo" aria-hidden="true" />Anwe Studio</Link>;
}
