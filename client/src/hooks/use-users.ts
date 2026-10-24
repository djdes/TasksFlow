import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

/** enabled=false — не запрашивать, пока список не нужен (быстрый переход закрыт). */
export function useUsers(enabled = true) {
  return useQuery({
    queryKey: [api.users.list.path],
    enabled,
    queryFn: async ({ signal }) => {
      const res = await fetchOrFriendlyError(api.users.list.path, {
        credentials: "include",
        signal: withTimeout(signal, 30_000),
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return api.users.list.responses[200].parse(await res.json());
    },
  });
}
