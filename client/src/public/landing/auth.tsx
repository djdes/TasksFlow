/**
 * Email-авторизация лендинга — структура как в ordersflow (yesbeat-style):
 * одно поле email + одна кнопка, авторегистрация/автологин. Цвет — indigo
 * (дизайн-токены TasksFlow), не жёлтый.
 *
 * Поток (см. server /api/auth/start):
 *   новый email      → сервер создаёт аккаунт + ставит сессию → редирект /dashboard
 *   существующий     → сервер шлёт magic-письмо → показываем шаг «письмо
 *                      отправлено» + поле пароля (вход по паролю / новый пароль)
 *
 * Клиентская подсказка опечаток (gmail.ru→gmail.com) блокирует отправку,
 * пока пользователь не подтвердит. Сервер дополнительно проверяет MX.
 *
 * SSR-safe: при первом рендере (step="email") нет обращений к window;
 * вся логика — в обработчиках (клиент).
 */
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2, X } from "lucide-react";
import { suggestEmailFix } from "./email-typo";

type Step = "email" | "sent";

async function postJson(path: string, body: unknown) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let data: any = {};
  try {
    data = await r.json();
  } catch {
    /* пустое тело */
  }
  return { ok: r.ok, status: r.status, data };
}

export function AuthForm({
  layout = "stacked",
  autoFocus = false,
}: {
  layout?: "stacked" | "row";
  autoFocus?: boolean;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startAuth() {
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await postJson("/api/auth/start", { email });
      if (!ok) {
        if (data.suggestion) setSuggestion(data.suggestion);
        setError(data.message || "Не удалось войти");
        return;
      }
      if (data.exists) {
        setStep("sent");
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setError("Нет связи с сервером. Проверьте интернет.");
    } finally {
      setBusy(false);
    }
  }

  function submitEmail(e: FormEvent) {
    e.preventDefault();
    const fix = suggestEmailFix(email);
    if (fix && fix !== email) {
      setSuggestion(fix);
      return;
    }
    startAuth();
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await postJson("/api/auth/login-email", { email, password });
      if (!ok) {
        setError(data.message || "Не вошли");
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError("Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  }

  async function recover() {
    setBusy(true);
    setError("");
    try {
      await postJson("/api/auth/recover", { email });
      setStep("sent");
    } catch {
      setError("Не удалось отправить письмо.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full pl-11 pr-4 py-3 rounded-xl bg-background border border-input text-foreground " +
    "placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 " +
    "focus:ring-ring/30 transition";
  const btnCls =
    "rounded-full bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 " +
    "hover:shadow-xl hover:shadow-primary/40 hover:brightness-105 disabled:opacity-60 transition";

  if (step === "sent") {
    return (
      <div className="w-full">
        <div className="text-center mb-4">
          <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Письмо отправлено</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Проверьте <strong className="text-foreground">{email}</strong> — внутри кнопка
            «Открыть кабинет». Один клик — и вы внутри.
          </p>
        </div>
        <div className="relative my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">или войдите паролем</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <form onSubmit={submitPassword} className="space-y-3">
          <label className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              <Lock className="w-5 h-5" />
            </span>
            <input
              type={showPw ? "text" : "password"}
              placeholder="Пароль из письма"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={inputCls + " pr-12"}
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPw ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </label>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <button type="submit" disabled={busy || !password.trim()} className={btnCls + " w-full py-3"}>
            {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Войти"}
          </button>
          <div className="flex justify-between text-sm pt-1">
            <button type="button" onClick={() => { setStep("email"); setPassword(""); setError(""); }} className="text-muted-foreground hover:text-foreground">
              ← Другой email
            </button>
            <button type="button" onClick={recover} disabled={busy} className="text-primary hover:underline disabled:opacity-50">
              Прислать новый пароль
            </button>
          </div>
        </form>
      </div>
    );
  }

  // step === "email"
  const isRow = layout === "row";
  return (
    <form onSubmit={submitEmail} className={isRow ? "w-full" : "w-full space-y-3"}>
      <div className={isRow ? "flex flex-col sm:flex-row gap-3" : "space-y-3"}>
        <label className="relative block flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <Mail className="w-5 h-5" />
          </span>
          <input
            type="email"
            placeholder="Ваш email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setSuggestion(null); setError(""); }}
            autoComplete="email"
            required
            autoFocus={autoFocus}
            className={inputCls}
          />
        </label>
        <button type="submit" disabled={busy} className={btnCls + (isRow ? " px-7 py-3 whitespace-nowrap" : " w-full py-3")}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Войти или зарегистрироваться"}
        </button>
      </div>

      {suggestion && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
          Возможно, вы имели в виду{" "}
          <button type="button" className="font-semibold underline" onClick={() => { setEmail(suggestion); setSuggestion(null); }}>
            {suggestion}
          </button>
          ?{" "}
          <button type="button" className="text-muted-foreground underline" onClick={() => { setSuggestion(null); startAuth(); }}>
            оставить как есть
          </button>
        </p>
      )}
      {error && !suggestion && <p className="text-sm text-destructive mt-2">{error}</p>}
      {!isRow && (
        <p className="text-xs text-muted-foreground text-center">
          Регистрация за секунду — пароль придёт на почту, входить можно сразу.
        </p>
      )}
    </form>
  );
}

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-card border border-border p-6 sm:p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 text-muted-foreground hover:text-foreground"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-foreground mb-1">Вход в TasksFlow</h2>
        <p className="text-sm text-muted-foreground mb-5">Введите email — создадим аккаунт или войдём.</p>
        <AuthForm layout="stacked" autoFocus />
      </div>
    </div>,
    document.body,
  );
}
