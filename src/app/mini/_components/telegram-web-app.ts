/**
 * Minimal typed surface for `window.Telegram.WebApp`.
 *
 * Not using `@twa-dev/sdk` to keep the dependency graph small for Stage 1;
 * if richer SDK features are needed later (haptics, main button, etc.) we
 * can swap this out for the official wrapper.
 */

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: {
    user?: { id: number; first_name?: string; last_name?: string };
  };
  ready(): void;
  expand(): void;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;
  close?: () => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}
