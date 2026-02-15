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
  { href: '/carveouts', label: 'Carve Outs' },
  { href: '/meetings', label: 'Meetings' },
  { href: '/members', label: 'Members' },
  { href: '/imports', label: 'Imports' },
  { href: '/login', label: 'Login' }
];

export function Nav() {
  const pathname = usePathname();
  const { loading, member } = useSession();

  if (loading || !member) {
    return null;
  }

  const visibleLinks = links
    .filter((link) => link.href !== '/login')
    .filter((link) => (link.href === '/imports' ? member.isAdmin : true));

  return (
    <nav className="nav">
      {visibleLinks.map((link) => {
        const active = pathname === link.href;
        return (
          <Link key={link.href} className={active ? 'nav-link active' : 'nav-link'} href={link.href}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
