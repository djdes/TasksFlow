import { useQuery } from "@tanstack/react-query";
import type { AppInfo } from "@shared/app-info";

/** Откуда ставить приложения: APK с сайта, Google Play, RuStore, App Store. */
export function useAppInfo() {
  return useQuery<AppInfo>({
    queryKey: ["/api/app/info"],
    queryFn: async () => {
      const res = await fetch("/api/app/info", { credentials: "include" });
      if (!res.ok) throw new Error("app info");
      return res.json();
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}
