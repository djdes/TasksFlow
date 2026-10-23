import { useCallback, useSyncExternalStore } from "react";

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

/**
 * Подписка на изменение media query. Safari ниже 14 и старые WebView не
 * знают addEventListener у MediaQueryList — только устаревший addListener.
 * Без запасного пути подписка бросала TypeError в MotionProvider, и весь
 * кабинет падал в ErrorBoundary.
 */
export function subscribeMediaQuery(media: MediaQueryList, notify: () => void): () => void {
  const legacy = media as LegacyMediaQueryList;
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
  }
  if (typeof legacy.addListener === "function") {
    legacy.addListener(notify);
    return () => legacy.removeListener?.(notify);
  }
  return () => {};
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (notify: () => void) => subscribeMediaQuery(window.matchMedia(query), notify),
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)");
}
