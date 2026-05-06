import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

export function useUsers() {
  return useQuery({
    queryKey: [api.users.list.path],
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
