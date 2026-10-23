import { useQuery } from "@tanstack/react-query";
import { fetchOrFriendlyError } from "@/lib/queryClient";
import { DEFAULT_PHOTO_SETTINGS, type PhotoSettings } from "@shared/photo-settings";

/**
 * Настроена ли у компании интеграция с WeSetup (свои baseUrl+apiKey).
 * По нему кабинет показывает журнальный режим / журнальные фильтры.
 * Глобальный env WESETUP_* не учитывается на сервере — это осознанно,
 * чтобы публичный TasksFlow не показывал WeSetup всем подряд.
 */
type CompanyPublic = { name?: string; wesetupConfigured?: boolean; photo?: PhotoSettings } | null;

export function useWesetupConfiguration() {
  return useQuery<CompanyPublic>({
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

/**
 * Фото-отчёты компании (время на фото, «только камера») и её название для
 * подписи на фото. Тот же запрос /api/companies/me, что и выше.
 */
export function useCompanyPhotoSettings(): PhotoSettings & { place: string | null } {
  const data = useWesetupConfiguration().data;
  return { ...(data?.photo ?? DEFAULT_PHOTO_SETTINGS), place: data?.name ?? null };
}
