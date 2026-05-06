import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { fetchOrFriendlyError } from "@/lib/queryClient";

export function useUsers() {
  return useQuery({
    queryKey: [api.users.list.path],
    queryFn: async ({ signal }) => {
      const timeoutSignal = AbortSignal.timeout(30_000);
      const combined =
        "any" in AbortSignal && signal
          ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([
              signal,
              timeoutSignal,
            ])
          : timeoutSignal;
      const res = await fetchOrFriendlyError(api.users.list.path, {
        credentials: "include",
        signal: combined,
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return api.users.list.responses[200].parse(await res.json());
    },
  });
}
