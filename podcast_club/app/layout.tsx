import type { Metadata, Viewport } from 'next';
import { Manrope, Spectral } from 'next/font/google';
import { MobileNav, Nav } from '@/components/Nav';
import { AuthStatus } from '@/components/AuthStatus';
import './globals.css';

const sans = Manrope({ subsets: ['latin'], variable: '--font-sans' });
const serif = Spectral({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'Royal Podcast Society',
  description: 'Monthly podcast club planner with voting and meeting history.'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

const suppressInjectedWalletErrors = `
(() => {
  const isInjectedWalletSelectedAddressError = (event) => {
    const message = String(event?.message || event?.reason?.message || event?.error?.message || event?.reason || '');
    return message.includes('selectedAddress') && message.includes('undefined');
  };

  window.addEventListener(
    'error',
    (event) => {
      if (!isInjectedWalletSelectedAddressError(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (!isInjectedWalletSelectedAddressError(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: suppressInjectedWalletErrors }} />
        <div className="page-bg" />
        <main className="shell">
          <header className="site-header">
            <div className="site-header-title">
              <h1>Royal Podcast Society</h1>
              <p>Enjoying podcast discussions one meeting at a time.</p>
            </div>
            <Nav />
            <div className="auth-status-wrap">
              <AuthStatus />
            </div>
          </header>
          {children}
          <MobileNav />
        </main>
      </body>
    </html>
  );
}
