import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { HISTORY_KEY, SUMMARY_KEY } from "@/lib/reports-api";

/**
 * Живые обновления: сервер шлёт «tasks», когда кто-то в компании закрыл,
 * создал или изменил задачу (сайт, Telegram, WeSetup). Перезапрашиваем
 * списки с небольшой паузой — пачка событий даёт один запрос.
 * Без EventSource (старый браузер) всё работает как раньше: по фокусу окна.
 */
const REFRESH_DELAY_MS = 400;

export function useLiveUpdates(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;
    let timer: number | undefined;
    const source = new EventSource("/api/events", { withCredentials: true });
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: [api.tasks.list.path] });
        void queryClient.invalidateQueries({ queryKey: ["awaiting-verification"] });
        void queryClient.invalidateQueries({ queryKey: [api.users.list.path] });
        void queryClient.invalidateQueries({ queryKey: [HISTORY_KEY] });
        void queryClient.invalidateQueries({ queryKey: [SUMMARY_KEY] });
      }, REFRESH_DELAY_MS);
    };
    source.addEventListener("tasks", refresh);
    return () => {
      window.clearTimeout(timer);
      source.removeEventListener("tasks", refresh);
      source.close();
    };
  }, [enabled, queryClient]);
}
