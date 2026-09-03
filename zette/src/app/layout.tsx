import type { Metadata, Viewport } from "next";
import { Manrope, Newsreader } from "next/font/google";
import {
  ZETTE_ICON_THEME_COLOR,
  withIconVersion,
} from "@/lib/icon-config";
import { withBasePath } from "@/lib/base-path";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Zette",
  title: "Zette",
  description: "A fount of wisdom drawn from everything you've read.",
  icons: {
    icon: [
      { url: withBasePath(withIconVersion("/favicon.ico")), sizes: "any" },
      {
        url: withBasePath(withIconVersion("/icon.png")),
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: withBasePath(withIconVersion("/apple-icon.png")),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Zette",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: ZETTE_ICON_THEME_COLOR },
    { media: "(prefers-color-scheme: dark)", color: "#241026" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${newsreader.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
