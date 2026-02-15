'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { US_STATE_CODES } from '@/lib/address';
import { withBasePath } from '@/lib/base-path';

type Mode = 'login' | 'register';

const loginInitial = {
  email: '',
  password: ''
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
  const [saving, setSaving] = useState(false);

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
        setMode(payload.hasUsers ? 'login' : 'register');
      } catch {
        setError('Could not load setup status. Check server logs and environment variables.');
      }
    }

    void loadSetup();
  }, []);

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch(withBasePath('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm)
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to login.');
      setSaving(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  async function submitRegister(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch(withBasePath('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerForm)
    });

    if (!res.ok) {
      const payload = await res.json();
      setError(payload.message || 'Unable to register.');
      setSaving(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <section className="grid" style={{ marginTop: '1rem' }}>
      <div className="card" style={{ maxWidth: '520px' }}>
        <h2>{mode === 'login' ? 'Login' : hasUsers ? 'Register With Join Code' : 'Create First Admin Account'}</h2>
        <p>
          {mode === 'login'
            ? 'Sign in with your Podcast Club email/password.'
            : hasUsers
              ? 'Enter your one-time join code to create your member account.'
              : 'Registration is only open for first-time setup.'}
        </p>

        {mode === 'login' ? (
          <form className="form" onSubmit={submitLogin}>
            <label>
              Email
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                required
              />
            </label>
            <button disabled={saving}>{saving ? 'Signing in...' : 'Sign In'}</button>
            <p>
              <Link className="nav-link" href="/forgot-password">
                Forgot password?
              </Link>
            </p>
            <p>
              <Link className="nav-link" href="/claim-account">
                Claim account with admin code
              </Link>
            </p>
          </form>
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
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={registerForm.password}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
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

        {error ? <p className="error">{error}</p> : null}
      </div>
    </section>
  );
}
