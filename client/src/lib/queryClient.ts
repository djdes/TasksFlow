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

// Default timeout для всех простых GET/POST. Совпадает с server-side
// timeout'ом fetch к WeSetup (30s) — то есть если backend hung'нется,
// клиент всё равно получит явный fail после 30 секунд через AbortError
// → ApiError → toast «Не удалось». Без таймаута бабушка-воркер видит
// бесконечный спиннер.
//
// Для file-upload путей (multer multipart) уровень выше использует
// явный AbortSignal.timeout(120_000) — этот default им не подходит.
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

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
    signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    // signal приходит из TanStack Query — auto-abort при unmount/refetch
    // компонента. Таймаут добавляем поверх через AbortSignal.any —
    // первый из двух сигналов тригерит abort. (Node 20+, Chrome 118+.)
    const timeoutSignal = AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS);
    const combined =
      "any" in AbortSignal && signal
        ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([
            signal,
            timeoutSignal,
          ])
        : timeoutSignal;
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      signal: combined,
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
