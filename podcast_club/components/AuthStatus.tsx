'use client';

import Link from 'next/link';
import { withBasePath } from '@/lib/base-path';
import { useSession } from '@/lib/use-session';

export function AuthStatus() {
  const { loading, member, refresh } = useSession();

  async function logout() {
    await fetch(withBasePath('/api/auth/logout'), { method: 'POST', cache: 'no-store' });
    await refresh();
    window.location.assign(withBasePath('/'));
  }

  async function stopPreview() {
    await fetch(withBasePath('/api/auth/preview'), { method: 'DELETE', cache: 'no-store' });
    await refresh();
    window.location.assign(withBasePath('/'));
  }

  if (loading) {
    return <p>Checking session...</p>;
  }

  if (!member) {
    return (
      <div className="inline" style={{ justifyContent: 'flex-end' }}>
        <Link className="nav-link" href="/login">
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className="inline" style={{ justifyContent: 'space-between' }}>
      <span>
        {member.isImpersonating ? (
          <>
            Previewing as <strong>{member.name}</strong> ({member.isAdmin ? 'Admin' : 'Member'}) from{' '}
            <strong>{member.impersonatorName || 'Admin'}</strong>
          </>
        ) : (
          <>
            Signed in as <strong>{member.name}</strong> ({member.isAdmin ? 'Admin' : 'Member'})
          </>
        )}
      </span>
      <div className="inline">
        {member.isImpersonating ? (
          <button className="secondary" onClick={stopPreview}>
            Exit Preview
          </button>
        ) : null}
        <button className="ghost" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}
