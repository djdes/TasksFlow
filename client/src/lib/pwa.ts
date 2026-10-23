import { useSyncExternalStore } from "react";

/**
 * Установка TasksFlow на телефон и мост к приложениям.
 *
 *  - service worker (офлайн-страница, push) — registerServiceWorker();
 *  - установка из браузера: Android/десктоп — системный запрос
 *    (beforeinstallprompt), iPhone — «Поделиться → На экран Домой»;
 *  - внутри наших приложений: iOS-оболочка даёт window.TasksFlowNative,
 *    Android-приложение (TWA) узнаём по referrer android-app://.
 */

type NativeBridge = {
  platform: "ios";
  version: string;
  call: (type: string, payload?: Record<string, unknown>) => Promise<unknown>;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    TasksFlowNative?: NativeBridge;
  }
}

export type DevicePlatform = "ios" | "android" | "desktop";
export type AppShell = "ios" | "android" | null;

export type InstallState = {
  platform: DevicePlatform;
  /** Открыто в нашем приложении (iOS-оболочка или Android TWA). */
  shell: AppShell;
  /** Установлено как приложение: оболочка или PWA без адресной строки. */
  installed: boolean;
  /** Браузер готов показать системное окно установки. */
  canPrompt: boolean;
};

const ANDROID_APP_REFERRER = "android-app://ru.tasksflow.app";
const SHELL_KEY = "tf_app_shell";

export function nativeBridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.TasksFlowNative;
  return bridge && typeof bridge.call === "function" ? bridge : null;
}

export function detectPlatform(ua: string, maxTouchPoints = 0): DevicePlatform {
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** Какая наша оболочка открыла страницу: по мосту, метке в UA или referrer TWA. */
export function detectShell(input: { ua: string; referrer: string; stored: string | null; hasBridge: boolean }): AppShell {
  if (input.hasBridge || /TasksFlowApp\//.test(input.ua)) return "ios";
  if (input.referrer.startsWith(ANDROID_APP_REFERRER) || input.stored === "android") return "android";
  return null;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
let snapshot: InstallState | null = null;

function emit() {
  snapshot = null;
  listeners.forEach((fn) => fn());
}

function readShell(): AppShell {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(SHELL_KEY);
  } catch {
    stored = null;
  }
  const shell = detectShell({
    ua: navigator.userAgent,
    referrer: document.referrer || "",
    stored,
    hasBridge: !!nativeBridge(),
  });
  // referrer TWA есть только у первой страницы — запоминаем на сессию.
  if (shell === "android" && stored !== "android") {
    try {
      sessionStorage.setItem(SHELL_KEY, "android");
    } catch {
      // приватный режим — ну и ладно
    }
  }
  return shell;
}

function computeState(): InstallState {
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints || 0);
  const shell = readShell();
  const standalone =
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    platform,
    shell,
    installed: !!shell || standalone || installedNow,
    canPrompt: !!deferredPrompt,
  };
}

function getSnapshot(): InstallState {
  if (!snapshot) snapshot = computeState();
  return snapshot;
}

const SERVER_STATE: InstallState = { platform: "desktop", shell: null, installed: false, canPrompt: false };

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

/**
 * Куда вести без сессии: в приложении и установленном PWA — на экран входа,
 * в браузере — на лендинг (там тоже есть вход, но и рассказ о продукте).
 */
export function signedOutPath(): string {
  if (typeof window === "undefined") return "/";
  return computeState().installed ? "/login" : "/";
}

/** Показать системное окно установки (Android Chrome, Edge/Chrome на компьютере). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  deferredPrompt = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") installedNow = true;
  emit();
  return outcome;
}

/** Короткий отклик на действие: в iOS-приложении — системный, на Android — вибрация. */
export function haptic(style: "success" | "error" | "light" = "light") {
  // «Меньше эффектов» (настройка движения или системная) — без вибрации тоже.
  if (typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced") return;
  const bridge = nativeBridge();
  if (bridge) {
    bridge.call("haptic", { style }).catch(() => {});
    return;
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(style === "error" ? [20, 40, 20] : style === "success" ? 14 : 8);
    } catch {
      // некоторые браузеры бросают без жеста пользователя
    }
  }
}

let started = false;

/**
 * Service worker и слушатели установки. В dev не регистрируем: Vite
 * отдаёт модули не из /assets, а офлайн-страница путала бы при отладке.
 */
export function registerServiceWorker() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedNow = true;
    emit();
  });
  if (typeof window.matchMedia === "function") {
    window.matchMedia("(display-mode: standalone)").addEventListener?.("change", emit);
  }

  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  // Клик по уведомлению во вкладке без нашего SW — SW просит перейти сам.
  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type === "tf:navigate" && typeof data.url === "string" && data.url.startsWith("/")) {
      window.location.assign(data.url);
    }
  });
  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // без SW сайт работает как раньше, просто без офлайн-страницы и push
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
