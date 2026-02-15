import type { Metadata } from 'next';
import { Manrope, Spectral } from 'next/font/google';
import { Nav } from '@/components/Nav';
import { AuthStatus } from '@/components/AuthStatus';
import './globals.css';

const sans = Manrope({ subsets: ['latin'], variable: '--font-sans' });
const serif = Spectral({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'Royal Podcast Society',
  description: 'Monthly podcast club planner with voting and meeting history.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>
        <div className="page-bg" />
        <main className="shell">
          <header className="site-header">
            <h1>Royal Podcast Society</h1>
            <p>Enjoying podcast discussions one meeting at a time.</p>
            <Nav />
            <div style={{ marginTop: '0.75rem' }}>
              <AuthStatus />
            </div>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
