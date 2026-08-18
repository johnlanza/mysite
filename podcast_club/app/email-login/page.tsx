'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

function EmailLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') || '';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function confirmSignIn() {
    if (!token || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(withBasePath('/api/auth/email-link/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(payload?.message || 'Unable to use this sign-in link.');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Unable to use this sign-in link.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="auth-page page-stack">
      <div className="card auth-card">
        <p className="section-kicker">Secure member access</p>
        <h2>Sign in to the Society</h2>
        {token ? (
          <>
            <p>Confirm below to finish signing in. This one-time link will not change your password.</p>
            <button type="button" onClick={confirmSignIn} disabled={saving}>
              {saving ? 'Signing in…' : 'Sign in securely'}
            </button>
          </>
        ) : (
          <p>This sign-in link is incomplete. Request a fresh link from the login page.</p>
        )}
        {error ? <p className="error">{error}</p> : null}
        <p className="auth-help-link">
          <Link className="nav-link" href="/login">Request another link</Link>
        </p>
      </div>
    </section>
  );
}

export default function EmailLoginPage() {
  return (
    <Suspense fallback={<section className="auth-page page-stack"><div className="card auth-card"><p>Preparing your secure sign-in…</p></div></section>}>
      <EmailLoginContent />
    </Suspense>
  );
}
