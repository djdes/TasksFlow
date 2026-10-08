import { useQuery } from "@tanstack/react-query";
import { fetchOrFriendlyError } from "@/lib/queryClient";

/**
 * Настроена ли у компании интеграция с WeSetup (свои baseUrl+apiKey).
 * По нему кабинет показывает журнальный режим / журнальные фильтры.
 * Глобальный env WESETUP_* не учитывается на сервере — это осознанно,
 * чтобы публичный TasksFlow не показывал WeSetup всем подряд.
 */
export function useWesetupConfiguration() {
  return useQuery<{ wesetupConfigured?: boolean } | null>({
    queryKey: ["companies", "me"],
    queryFn: async () => {
      const r = await fetchOrFriendlyError("/api/companies/me", {
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
      });
      return r.ok ? r.json() : null;
    },
  });
}

export function useWesetupEnabled(): boolean {
  return !!useWesetupConfiguration().data?.wesetupConfigured;
}
