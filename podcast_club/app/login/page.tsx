'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { US_STATE_CODES } from '@/lib/address';
import { withBasePath } from '@/lib/base-path';

type Mode = 'login' | 'register';

const loginInitial = {
  email: '',
  password: '',
  remember: true
};

const registerInitial = {
  name: '',
  email: '',
  password: '',
  inviteCode: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: ''
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [hasUsers, setHasUsers] = useState<boolean>(true);
  const [loginForm, setLoginForm] = useState(loginInitial);
  const [registerForm, setRegisterForm] = useState(registerInitial);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [emailSignInAvailable, setEmailSignInAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    async function loadSetup() {
      try {
        const res = await fetch(withBasePath('/api/auth/setup-status'), { cache: 'no-store' });
        if (!res.ok) {
          setError('Could not load setup status. Check server logs and environment variables.');
          return;
        }

        const payload = await res.json();
        setHasUsers(Boolean(payload.hasUsers));
        setEmailSignInAvailable(Boolean(payload.emailSignInAvailable));
        setMode(payload.hasUsers ? 'login' : 'register');
      } catch {
        setEmailSignInAvailable(false);
        setError('Could not load setup status. Check server logs and environment variables.');
      }
    }

    void loadSetup();
  }, []);

  async function requestEmailLink(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLinkSaving(true);
    try {
      const res = await fetch(withBasePath('/api/auth/email-link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginForm.email, remember: loginForm.remember })
      });
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(payload?.message || 'Unable to send a sign-in link.');
        return;
      }
      setMessage(payload?.message || 'Check your email for a secure sign-in link.');
    } catch {
      setError('Unable to send a sign-in link.');
    } finally {
      setLinkSaving(false);
    }
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const res = await fetch(withBasePath('/api/auth/login-legacy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message || 'Unable to login. Check server logs and environment variables.');
        setSaving(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Unable to login. Check server logs and environment variables.');
      setSaving(false);
    }
  }

  async function submitRegister(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const res = await fetch(withBasePath('/api/auth/register-legacy'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm)
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message || 'Unable to register. Check server logs and environment variables.');
        setSaving(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('Unable to register. Check server logs and environment variables.');
      setSaving(false);
    }
  }

  return (
    <section className="auth-page page-stack">
      <div className="card auth-card">
        <p className="section-kicker">Member access</p>
        <h2>{mode === 'login' ? 'Welcome back' : hasUsers ? 'Register With Join Code' : 'Create First Admin Account'}</h2>
        <p>
          {mode === 'login'
            ? 'Use a secure email link—no password to remember. Your existing password still works if you prefer it.'
            : hasUsers
              ? 'Enter your one-time join code to create your member account.'
              : 'Registration is only open for first-time setup.'}
        </p>

        {mode === 'login' ? (
          <div className="auth-methods">
            <form className="form email-link-form" onSubmit={requestEmailLink}>
              <div className="auth-method-heading">
                <span className="auth-method-icon" aria-hidden="true">✉</span>
                <span>
                  <strong>Email me a sign-in link</strong>
                  <small>Fastest on a phone. The link works once and expires in 15 minutes.</small>
                </span>
              </div>
              <label>
                Email
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="checkbox-row remember-row">
                <input
                  type="checkbox"
                  checked={loginForm.remember}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, remember: event.target.checked }))}
                />
                <span>Keep me signed in on this device</span>
              </label>
              <button disabled={linkSaving || emailSignInAvailable !== true}>
                {linkSaving
                  ? 'Sending…'
                  : emailSignInAvailable === false
                    ? 'Email sign-in temporarily unavailable'
                    : 'Send Sign-In Link'}
              </button>
            </form>

            <details className="password-login-details">
              <summary>Use a password instead</summary>
              <form className="form" onSubmit={submitLogin}>
                <label>
                  Email
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                    autoComplete="username"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button disabled={saving}>{saving ? 'Signing in…' : 'Sign In With Password'}</button>
                <p className="auth-help-link"><Link className="nav-link" href="/forgot-password">Forgot password?</Link></p>
              </form>
            </details>

            <p className="auth-help-link"><Link className="nav-link" href="/claim-account">Claim account with admin code</Link></p>
          </div>
        ) : (
          <form className="form" onSubmit={submitRegister}>
            <label>
              Name
              <input
                value={registerForm.name}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={registerForm.email}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={registerForm.password}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                autoComplete="new-password"
                required
              />
            </label>
            {hasUsers ? (
              <label>
                One-Time Join Code
                <input
                  value={registerForm.inviteCode}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, inviteCode: event.target.value }))}
                  placeholder="ABCDE-12345"
                  required
                />
              </label>
            ) : null}
            <label>
              Address Line 1
              <input
                value={registerForm.addressLine1}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, addressLine1: event.target.value }))}
                required
              />
            </label>
            <label>
              Address Line 2 (Optional)
              <input
                value={registerForm.addressLine2}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, addressLine2: event.target.value }))}
              />
            </label>
            <label>
              City
              <input
                value={registerForm.city}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, city: event.target.value }))}
                required
              />
            </label>
            <label>
              State
              <select
                value={registerForm.state}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, state: event.target.value }))}
                required
              >
                <option value="">Select state</option>
                {US_STATE_CODES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ZIP Code
              <input
                value={registerForm.postalCode}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, postalCode: event.target.value }))}
                required
              />
            </label>
            <button disabled={saving}>{saving ? 'Creating...' : hasUsers ? 'Create Member Account' : 'Create Admin Account'}</button>
          </form>
        )}

        {hasUsers ? (
          <div className="inline" style={{ marginTop: '0.75rem' }}>
            <button className={mode === 'register' ? 'secondary' : 'ghost'} onClick={() => setMode('register')}>
              Register With Code
            </button>
            <button className={mode === 'login' ? 'secondary' : 'ghost'} onClick={() => setMode('login')}>
              Back to Login
            </button>
          </div>
        ) : null}

        {!hasUsers ? (
          <div className="inline" style={{ marginTop: '0.75rem' }}>
            <button className={mode === 'register' ? 'secondary' : 'ghost'} onClick={() => setMode('register')}>
              First-Time Register
            </button>
          </div>
        ) : null}

        {message ? <p className="success auth-message">{message}</p> : null}
        {error ? <p className="error auth-message">{error}</p> : null}
      </div>

      {mode === 'login' ? (
        <div className="section-panel login-update-panel">
          <div className="section-title-row">
            <h2>New around the Society</h2>
            <span className="badge">Member update</span>
          </div>
          <div className="login-update-grid">
            <article><span aria-hidden="true">🎧</span><strong>Listen next</strong><small>Meeting picks and artwork are easy to find and tap in the car.</small></article>
            <article><span aria-hidden="true">↕</span><strong>Clearer ballot</strong><small>Active candidates are separated from the discussion archive.</small></article>
            <article><span aria-hidden="true">✦</span><strong>Smarter suggestions</strong><small>Filter ideas and see why the top episode fits the club.</small></article>
            <article><span aria-hidden="true">👊</span><strong>Better feedback</strong><small>Use fist bumps and choose more than one reaction after a meeting.</small></article>
          </div>
        </div>
      ) : null}
    </section>
  );
}
