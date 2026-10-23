import { useQuery } from "@tanstack/react-query";
import type { Location } from "@shared/schema";
import { fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

export const LOCATIONS_KEY = ["locations"] as const;

/** Точки компании (без архивных). Пустой список — у компании одна точка. */
export function useLocations(enabled = true) {
  return useQuery<Location[]>({
    queryKey: LOCATIONS_KEY,
    queryFn: async ({ signal }) => {
      const res = await fetchOrFriendlyError("/api/locations", { credentials: "include", signal: withTimeout(signal, 30_000) });
      if (!res.ok) throw new Error("Не удалось загрузить точки");
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });
}
