'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/use-session';

type NavLink = {
  href: Route;
  label: string;
};

const links: NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/podcasts', label: 'Podcasts' },
  { href: '/meetings', label: 'Meetings' },
  { href: '/carveouts', label: 'Carve Outs' },
  { href: '/more', label: 'More' },
  { href: '/members', label: 'Members' },
  { href: '/imports', label: 'Imports' },
  { href: '/login', label: 'Login' }
];

function MobileNavIcon({ href }: { href: Route }) {
  const iconProps = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  };

  if (href === '/') {
    return (
      <svg {...iconProps}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    );
  }

  if (href === '/podcasts') {
    return (
      <svg {...iconProps}>
        <rect x="9" y="4" width="6" height="10" rx="3" />
        <path d="M5.5 10.5v1A6.5 6.5 0 0 0 12 18a6.5 6.5 0 0 0 6.5-6.5v-1" />
        <path d="M12 18v3" />
        <path d="M9 21h6" />
      </svg>
    );
  }

  if (href === '/meetings') {
    return (
      <svg {...iconProps}>
        <path d="M7 3v4" />
        <path d="M17 3v4" />
        <path d="M4.5 8h15" />
        <rect x="4" y="5" width="16" height="16" rx="2.5" />
        <path d="M8 12h3" />
        <path d="M8 16h6" />
      </svg>
    );
  }

  if (href === '/carveouts') {
    return (
      <svg {...iconProps}>
        <path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v14l-6.5-3.6L5.5 20V6A1.5 1.5 0 0 1 7 4.5Z" />
        <path d="M12 8.2l.55 1.35L14 10.1l-1.45.55L12 12l-.55-1.35L10 10.1l1.45-.55L12 8.2Z" />
      </svg>
    );
  }

  return (
    <svg {...iconProps}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Nav() {
  const pathname = usePathname();
  const { loading, member } = useSession();

  if (loading || !member) {
    return null;
  }

  const desktopLinks = links
    .filter((link) => link.href !== '/login')
    .filter((link) => link.href !== '/more')
    .filter((link) => (link.href === '/imports' ? member.isAdmin : true));

  return (
    <nav className="nav nav-desktop" aria-label="Primary">
      {desktopLinks.map((link) => {
        const active = pathname === link.href || (link.href === '/podcasts' && pathname.startsWith('/podcasts'));
        return (
          <Link key={link.href} className={active ? 'nav-link active' : 'nav-link'} href={link.href}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { loading, member } = useSession();

  if (loading || !member) {
    return null;
  }

  const visibleLinks = links
    .filter((link) => link.href !== '/login')
    .filter((link) => link.href !== '/members')
    .filter((link) => link.href !== '/imports');

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary">
      {visibleLinks.map((link) => {
        const active = pathname === link.href || (link.href === '/podcasts' && pathname.startsWith('/podcasts'));
        return (
          <Link key={link.href} className={active ? 'mobile-nav-link active' : 'mobile-nav-link'} href={link.href}>
            <span className="mobile-nav-icon" aria-hidden="true">
              <MobileNavIcon href={link.href} />
            </span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
