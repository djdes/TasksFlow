import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { MiniSessionProvider } from "./_components/mini-session-provider";

/**
 * Mini App layout.
 *
 * Intentionally separate from the dashboard layout — no sidebar, no nav
 * chrome, no AuthSessionProvider (which requires a non-null session and
 * thus redirects unauthenticated users). Mini App routes accept anonymous
 * visits because the initData-based sign-in happens client-side inside
 * `/mini` itself.
 */

export const metadata: Metadata = {
  title: "WeSetup — Telegram",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function MiniLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <MiniSessionProvider>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
          {children}
        </main>
      </MiniSessionProvider>
    </>
  );
}
