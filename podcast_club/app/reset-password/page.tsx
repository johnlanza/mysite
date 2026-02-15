'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { withBasePath } from '@/lib/base-path';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const tokenFromQuery = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setToken(tokenFromQuery);
  }, [tokenFromQuery]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('A reset token/code is required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);

    const res = await fetch(withBasePath('/api/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.message || 'Unable to reset password.');
      setSaving(false);
      return;
    }

    setMessage(payload.message || 'Password reset successful. You can now log in.');
    setPassword('');
    setConfirmPassword('');
    setSaving(false);
  }

  return (
    <section className="grid" style={{ marginTop: '1rem' }}>
      <div className="card" style={{ maxWidth: '520px' }}>
        <h2>Reset Password</h2>
        <p>Enter your reset code (or email token link) and a new password (minimum 12 characters).</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Reset Code / Token
            <input value={token} onChange={(event) => setToken(event.target.value)} required />
          </label>
          <label>
            New Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              required
            />
          </label>
          <label>
            Confirm New Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={12}
              required
            />
          </label>
          <button disabled={saving}>{saving ? 'Saving...' : 'Reset Password'}</button>
        </form>
        {message ? <p>{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <p>
          <Link className="nav-link" href="/login">
            Back to Login
          </Link>
        </p>
      </div>
    </section>
  );
}
