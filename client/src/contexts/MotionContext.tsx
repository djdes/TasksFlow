import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { useMediaQuery } from "@/hooks/use-media-query";
import { MOTION_STORAGE_KEY, readMotionPreference, UI_SPRING } from "@/lib/motion";

const MotionContext = createContext({ enabled: true, reduced: false, setEnabled: (_value: boolean) => {} });

export function MotionProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(readMotionPreference);
  const systemReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const reduced = !enabled || systemReduced;
  useLayoutEffect(() => {
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  }, [reduced]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOTION_STORAGE_KEY || event.key === null) setEnabledState(readMotionPreference());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setEnabled = (next: boolean) => {
    setEnabledState(next);
    try { localStorage.setItem(MOTION_STORAGE_KEY, String(next)); } catch { /* Session preference still works. */ }
  };
  return (
    <MotionContext.Provider value={{ enabled, reduced, setEnabled }}>
      <MotionConfig reducedMotion={reduced ? "always" : "never"} transition={reduced ? { duration: 0 } : UI_SPRING}>
        {children}
      </MotionConfig>
    </MotionContext.Provider>
  );
}

export const useMotionPreference = () => useContext(MotionContext);
