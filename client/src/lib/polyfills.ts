/**
 * Заплатки для старых iPhone и Android.
 *
 * Кабинет зовёт AbortSignal.timeout у каждого запроса, а его нет в Safari
 * до 16 (iPhone 6s/7/SE первого поколения остаются на iOS 15) и в старых
 * WebView. Там запрос сессии падал с TypeError ещё до отправки, и человек
 * видел «Не удалось связаться с сервером», хотя /api/auth/me отвечал.
 * Подключается первой строкой обеих точек входа (кабинет и публичные страницы).
 */

type SignalStatics = {
  timeout?: (ms: number) => AbortSignal;
  any?: (signals: AbortSignal[]) => AbortSignal;
};

function timeoutError(): Error {
  try {
    return new DOMException("The operation was aborted due to timeout", "TimeoutError");
  } catch {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    return error;
  }
}

export function installAbortSignalPolyfills(target: SignalStatics | undefined = globalThis.AbortSignal as SignalStatics | undefined): void {
  if (!target || typeof AbortController === "undefined") return;

  if (typeof target.timeout !== "function") {
    target.timeout = (ms: number) => {
      const controller = new AbortController();
      setTimeout(() => {
        const abort = controller.abort as (reason?: unknown) => void;
        abort.call(controller, timeoutError());
      }, ms);
      return controller.signal;
    };
  }

  if (typeof target.any !== "function") {
    target.any = (signals: AbortSignal[]) => {
      const controller = new AbortController();
      const abort = controller.abort as (reason?: unknown) => void;
      for (const signal of signals) {
        if (signal.aborted) {
          abort.call(controller, (signal as { reason?: unknown }).reason);
          return controller.signal;
        }
      }
      for (const signal of signals) {
        signal.addEventListener("abort", () => abort.call(controller, (signal as { reason?: unknown }).reason), { once: true });
      }
      return controller.signal;
    };
  }
}

installAbortSignalPolyfills();
