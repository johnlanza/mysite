'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

export default function EmergencyRecoveryPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);

    const res = await fetch(withBasePath('/api/auth/emergency-recover'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, recoveryCode })
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.message || 'Unable to complete emergency recovery.');
      setSaving(false);
      return;
    }

    setMessage(payload.message || 'Recovery complete.');
    setPassword('');
    setConfirmPassword('');
    setRecoveryCode('');
    setSaving(false);
  }

  return (
    <section className="grid" style={{ marginTop: '1rem' }}>
      <div className="card" style={{ maxWidth: '520px' }}>
        <h2>Emergency Admin Recovery</h2>
        <p>Use your one-time owner recovery code to reset an admin password.</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Admin Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            One-Time Recovery Code
            <input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} required />
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
          <button disabled={saving}>{saving ? 'Saving...' : 'Reset Admin Password'}</button>
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
