import { useEffect, useRef, useState } from "react";

/**
 * Движение на публичных страницах выключено, если так решил пользователь:
 * системный prefers-reduced-motion или tf_motion_enabled=false из кабинета.
 * Оба случая public.html сводит в html[data-motion="reduced"] до гидрации.
 * На сервере считаем движение выключенным — разметка статична.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return (
    document.documentElement.dataset.motion === "reduced" ||
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * true, пока элемент виден на экране и вкладка активна. Автодемо
 * лендинга играют только в этот момент и не тратят батарею за кадром.
 */
export function useActiveInView<T extends Element>(threshold = 0.35) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    if (!el || !("IntersectionObserver" in window)) {
      setInView(true);
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
    io.observe(el);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [threshold]);

  return [ref, inView && pageVisible] as const;
}
