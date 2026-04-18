"use client";

import { SessionProvider } from "next-auth/react";

/**
 * SessionProvider for the Mini App route group.
 *
 * Unlike `AuthSessionProvider` (which demands a non-null session), this one
 * starts with `session={null}` and lets the Mini App's `/page.tsx` trigger
 * a Telegram `signIn` once the client has `window.Telegram.WebApp.initData`
 * in hand. `refetchOnWindowFocus` stays off because the Mini App webview
 * triggers focus events aggressively on iOS.
 */
export function MiniSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider
      session={null}
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}
