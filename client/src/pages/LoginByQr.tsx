import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { USER_LOGIN_PATH } from "@shared/user-login-link";

/**
 * Вход по личному QR (/login/qr/:token): сразу POST и в кабинет. На общем
 * планшете прежний аккаунт сменяется — сервер делает новую сессию.
 */
export default function LoginByQr() {
  const [, params] = useRoute("/login/qr/:token");
  const token = params?.token ?? "";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const started = useRef(false);

  const enter = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiRequest("POST", `${USER_LOGIN_PATH}/${encodeURIComponent(token)}`, {});
      try {
        // Другие вкладки с прежним аккаунтом перезагрузятся.
        localStorage.setItem("tf_account_changed", `${Date.now()}-${Math.random()}`);
      } catch {
        /* приватный режим */
      }
      // Полная загрузка: кэш прежнего аккаунта не должен мелькнуть.
      window.location.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell title="Вход по QR-коду" subtitle={error ? undefined : "Секунду — открываем ваши задачи"}>
      {error ? (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-destructive" data-testid="qr-login-error">
            {error}
          </p>
          <Button className="w-full" onClick={() => void enter()} disabled={busy}>
            Повторить
          </Button>
          <a href="/login" className="login-link">
            Войти по телефону и PIN
          </a>
        </div>
      ) : (
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary"
          role="status"
          aria-label="Входим"
        />
      )}
    </AuthShell>
  );
}
