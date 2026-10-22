const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const GOOGLE_URL = import.meta.env.VITE_GOOGLE_AUTH_URL || '';
export const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || '/dashboard';
export const API_CONFIGURED = Boolean(API_BASE);

async function post(path, body={}) {
  if (!API_BASE) throw new Error('NOT_CONFIGURED');
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('NETWORK');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'REQUEST_FAILED');
    error.status = response.status;
    error.code = data.code;
    error.data=data;
    throw error;
  }
  return data;
}

export const authService = {
  login: (email, password, remember) => post('/auth/login', { email, password, remember }),
  signup: (name, email, password) => post('/auth/signup', { name, email, password }),
    verifyOtp: (email, code) => post('/auth/verify-otp', { email, code }),
  resendOtp: email => post('/auth/resend-otp', { email }),
  resetPassword: (token, password) => post('/auth/reset-password', { token, password }),
  changePassword: (currentPassword, newPassword) =>
    post('/auth/change-password', { current_password: currentPassword || null, new_password: newPassword }),
  forgotPassword: email => post('/auth/forgot-password', { email }),
  // Backend endpoint still needed: POST /auth/logout (clears the session cookie)
  logout: () => post('/auth/logout', {}),
  google() {
    if (!GOOGLE_URL) throw new Error('GOOGLE_NOT_CONFIGURED');
    window.location.assign(GOOGLE_URL);
  },
  async me() {
    if (!API_BASE) return null;
    try {
      const response = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }
};

export function errorMessage(error) {
  if (error.message === 'NOT_CONFIGURED') return 'Authentication isn’t connected yet. Set VITE_API_BASE_URL when your backend is ready.';
  if (error.message === 'GOOGLE_NOT_CONFIGURED') return 'Google sign-in isn’t connected yet. Set VITE_GOOGLE_AUTH_URL after configuring Google OAuth.';
  if (error.message === 'NETWORK') return 'We couldn’t reach the server. Check your connection and try again.';
  if (error.status === 401) return 'That email or password doesn’t match. Please try again.';
  if (error.status === 409) return 'An account with that email already exists. Try logging in.';
  return error.message !== 'REQUEST_FAILED' ? error.message : 'Something went wrong. Please try again.';
}
