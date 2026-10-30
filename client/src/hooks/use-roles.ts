import { useQuery } from "@tanstack/react-query";
import type { RolesResponse } from "@shared/roles";
import { fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

export const ROLES_KEY = ["/api/roles"] as const;

/** Свои роли компании и настройка «Сотрудника» (админ и тот, кто добавляет людей). */
export function useRoles(enabled = true) {
  return useQuery<RolesResponse>({
    queryKey: ROLES_KEY,
    queryFn: async ({ signal }) => {
      const res = await fetchOrFriendlyError("/api/roles", { credentials: "include", signal: withTimeout(signal, 30_000) });
      if (!res.ok) throw new Error("Не удалось загрузить роли");
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });
}
