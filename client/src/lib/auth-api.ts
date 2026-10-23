import { fetchOrFriendlyError } from "@/lib/queryClient";
import type { PinSubmitError } from "@/components/PinFlow";

/**
 * POST JSON для регистрации и приглашений. Ошибки сети превращаются в
 * понятный текст (fetchOrFriendlyError), тело ответа отдаётся как есть.
 */
export async function postAuthJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const response = await fetchOrFriendlyError(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data: (data ?? {}) as Record<string, unknown> };
  } catch (err) {
    return { ok: false, status: 0, data: { message: err instanceof Error ? err.message : "Нет связи с сервером" } };
  }
}

/** Ошибка сервера в формате шага PIN. */
export function toPinSubmitError(data: Record<string, unknown>, fallback = "Не удалось зарегистрироваться"): PinSubmitError {
  return {
    message: typeof data.message === "string" && data.message ? data.message : fallback,
    attemptsLeft: typeof data.attemptsLeft === "number" ? data.attemptsLeft : undefined,
    retryAfterSec: typeof data.retryAfterSec === "number" ? data.retryAfterSec : undefined,
    step: data.step === "pin" ? "pin" : undefined,
  };
}
