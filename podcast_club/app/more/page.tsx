'use client';

import Link from 'next/link';
import { useSession } from '@/lib/use-session';

function MoreIcon({ name }: { name: 'members' | 'imports' }) {
  const iconProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.1,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  };

  if (name === 'imports') {
    return (
      <svg {...iconProps}>
        <path d="M12 3v11" />
        <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
        <path d="M5 16.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5" />
        <path d="M7 5h10" />
      </svg>
    );
  }

  return (
    <svg {...iconProps}>
      <path d="M16 19c0-2.2-1.8-4-4-4s-4 1.8-4 4" />
      <circle cx="12" cy="9" r="3" />
      <path d="M4.5 18.5c0-1.7 1.1-3.2 2.6-3.8" />
      <path d="M19.5 18.5c0-1.7-1.1-3.2-2.6-3.8" />
      <path d="M7.2 10.5A2.5 2.5 0 1 1 7.8 6" />
      <path d="M16.8 10.5A2.5 2.5 0 1 0 16.2 6" />
    </svg>
  );
}

export default function MorePage() {
  const { loading, member } = useSession();

  if (loading) {
    return (
      <section className="more-page page-stack">
        <div className="section-panel">
          <h2>More</h2>
          <p>Loading...</p>
        </div>
      </section>
    );
  }

  if (!member) {
    return (
      <section className="more-page page-stack">
        <div className="section-panel">
          <h2>More</h2>
          <p>Please login to view club tools.</p>
          <Link className="action-link" href="/login">
            Go to Login
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="more-page page-stack">
      <div className="section-panel more-panel">
        <div className="section-title-row">
          <h2>More</h2>
          <span className="badge">{member.isAdmin ? 'Admin' : 'Member'}</span>
        </div>
        <div className="more-account-card">
          <span>Signed in as</span>
          <strong>{member.name}</strong>
        </div>

        <div className="more-menu-section">
          <p className="section-kicker">Club</p>
          <div className="mobile-menu-list">
            <Link href="/members" className="mobile-menu-row">
              <span className="more-row-icon">
                <MoreIcon name="members" />
              </span>
              <span className="more-row-copy">
                <strong>{member.isAdmin ? 'Manage Members' : 'Member Directory'}</strong>
                <small>{member.isAdmin ? 'Roster, addresses, join codes, and member admin.' : 'Roster, addresses, and member details.'}</small>
              </span>
              <span className="mobile-menu-arrow" aria-hidden="true">
                &gt;
              </span>
            </Link>
          </div>
        </div>

        {member.isAdmin ? (
          <div className="more-menu-section">
            <p className="section-kicker">Admin</p>
            <div className="mobile-menu-list">
              <Link href="/imports" className="mobile-menu-row">
                <span className="more-row-icon">
                  <MoreIcon name="imports" />
                </span>
                <span className="more-row-copy">
                  <strong>Import Data</strong>
                  <small>Legacy podcasts, meetings, and carve outs.</small>
                </span>
                <span className="mobile-menu-arrow" aria-hidden="true">
                  &gt;
                </span>
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
