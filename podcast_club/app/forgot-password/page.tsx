'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);

    const res = await fetch(withBasePath('/api/auth/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const payload = await res.json();
    if (!res.ok) {
      setError(payload.message || 'Unable to start password reset.');
      setSaving(false);
      return;
    }

    setMessage(payload.message || 'If an account exists, a reset email has been sent.');
    setSaving(false);
  }

  return (
    <section className="grid" style={{ marginTop: '1rem' }}>
      <div className="card" style={{ maxWidth: '520px' }}>
        <h2>Forgot Password</h2>
        <p>Enter your email and we will send a password reset link if the account exists.</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <button disabled={saving}>{saving ? 'Sending...' : 'Send Reset Link'}</button>
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
