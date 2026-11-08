import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Есть ли сеть: navigator.onLine и события online/offline. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/**
 * «Нет сети» — плашка вверху кабинета, пока нет интернета (подвал, склад).
 * Фото и так ждут сети в очереди (lib/upload-queue), плашка просто честно
 * говорит, почему список не обновляется.
 */
export function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-bar" role="status" aria-live="polite" data-testid="offline-bar">
      <WifiOff aria-hidden />
      Нет сети
    </div>
  );
}
