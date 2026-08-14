import type { Metadata, Viewport } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BrandIntro } from '@/components/BrandIntro';
import { Manrope, Spectral } from 'next/font/google';
import { MobileNav, Nav } from '@/components/Nav';
import { AuthStatus } from '@/components/AuthStatus';
import { PalettePreferenceSync } from '@/components/PalettePreferenceSync';
import { withBasePath } from '@/lib/base-path';
import { DEFAULT_PALETTE, PALETTE_IDS, PALETTE_STORAGE_KEY } from '@/lib/palettes';
import { isReadOnlyPreview, READ_ONLY_PREVIEW_MESSAGE } from '@/lib/preview-mode';
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

const restorePalettePreference = `
(() => {
  try {
    const palette = window.localStorage.getItem('${PALETTE_STORAGE_KEY}');
    const availablePalettes = ${JSON.stringify(PALETTE_IDS)};
    document.documentElement.dataset.palette = availablePalettes.includes(palette)
      ? palette
      : '${DEFAULT_PALETTE}';
  } catch {
    document.documentElement.dataset.palette = '${DEFAULT_PALETTE}';
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const readOnlyPreview = isReadOnlyPreview();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: restorePalettePreference }} />
      </head>
      <body className={`${sans.variable} ${serif.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: suppressInjectedWalletErrors }} />
        <PalettePreferenceSync />
        <BrandIntro />
        <div className="page-bg" />
        <main className="shell">
          {readOnlyPreview ? (
            <div className="preview-mode-banner" role="status">
              <strong>Read-only preview</strong>
              <span>{READ_ONLY_PREVIEW_MESSAGE}</span>
            </div>
          ) : null}
          <header className="site-header">
            <Link className="brand-lockup" href="/">
              <div className="brand-mark-wrap" aria-hidden="true">
                <Image
                  className="brand-mark"
                  src={withBasePath('/royal-podcast-society-logo-transparent.png')}
                  alt=""
                  width={1254}
                  height={1254}
                  priority
                />
              </div>
              <div className="site-header-title">
                <h1>Royal Podcast Society</h1>
                <p>Enjoying podcast discussions one meeting at a time.</p>
              </div>
            </Link>
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
