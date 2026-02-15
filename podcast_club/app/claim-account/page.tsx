'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

export default function ClaimAccountPage() {
  const [email, setEmail] = useState('');
  const [claimCode, setClaimCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    const res = await fetch(withBasePath('/api/auth/claim-account'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, claimCode, password })
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.message || 'Unable to claim account.');
      setSaving(false);
      return;
    }

    setMessage(payload.message || 'Account claimed. You can now log in.');
    setClaimCode('');
    setPassword('');
    setConfirmPassword('');
    setSaving(false);
  }

  return (
    <section className="grid" style={{ marginTop: '1rem' }}>
      <div className="card" style={{ maxWidth: '520px' }}>
        <h2>Claim Account</h2>
        <p>Use the email and one-time claim code provided by your admin to set your password.</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            One-Time Claim Code
            <input value={claimCode} onChange={(event) => setClaimCode(event.target.value)} required />
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
          <button disabled={saving}>{saving ? 'Claiming...' : 'Claim Account'}</button>
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
