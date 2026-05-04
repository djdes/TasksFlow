import { QueryClient, QueryFunction } from "@tanstack/react-query";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.message ?? text;
    } catch {
      // тело не JSON (например HTML от прокси) — оставляем raw text
    }
    throw new ApiError(message, res.status);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      // refetchOnWindowFocus: воркер открывает приложение из таски на
      // компьютере / переключает с другой вкладки — список тут же
      // обновляется без явного «Обновить». Раньше staleTime:Infinity
      // оставлял данные часами устаревшими.
      refetchOnWindowFocus: true,
      // staleTime: 30s — между фокусом и фокусом данные считаются
      // свежими, query не дёргается; после 30s следующий обращение
      // refetch'ится. Гораздо адекватнее чем Infinity.
      staleTime: 30_000,
      refetchInterval: false,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
