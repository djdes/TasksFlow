/**
 * Единый вход/регистрация лендинга (стиль Госуслуг): ОДНО поле — телефон
 * ИЛИ email — и одна кнопка. Цвет indigo (токены TasksFlow).
 *
 * Логика по введённому значению:
 *   • телефон  → POST /api/auth/login. Есть аккаунт → в кабинет; нет →
 *                на регистрацию /register?phone=… (как обычный вход TasksFlow).
 *   • email    → POST /api/auth/start. Новый → сервер создаёт аккаунт и
 *                ставит сессию → в кабинет; существующий → письмо +
 *                шаг с паролем.
 *
 * Подсказка опечаток домена (gmail.ru→gmail.com) — только для email.
 * SSR-safe: при первом рендере нет обращений к window.
 */
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { User, Lock, Eye, EyeOff, Loader2, CheckCircle2, X } from "lucide-react";
import { suggestEmailFix } from "./email-typo";
import { detectIdentity } from "./identity";

type Step = "input" | "sent";

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
  submitLabel = "Войти или зарегистрироваться",
}: {
  layout?: "stacked" | "row";
  autoFocus?: boolean;
  submitLabel?: string;
}) {
  const [step, setStep] = useState<Step>("input");
  const [value, setValue] = useState(""); // телефон или email
  const [sentEmail, setSentEmail] = useState(""); // email для шага «sent»
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startEmail(email: string) {
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
        setSentEmail(email);
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

  async function loginPhone(phone: string) {
    setBusy(true);
    setError("");
    try {
      const { ok, status, data } = await postJson("/api/auth/login", { phone });
      if (ok) {
        window.location.href = "/dashboard";
        return;
      }
      if (status === 401) {
        // нет аккаунта по телефону → регистрация (как обычный вход TasksFlow)
        window.location.href = `/register?phone=${encodeURIComponent(phone)}`;
        return;
      }
      setError(data.message || "Не удалось войти");
    } catch {
      setError("Нет связи с сервером. Проверьте интернет.");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const id = detectIdentity(value);
    if (id.kind === "email") {
      const fix = suggestEmailFix(id.email);
      if (fix && fix !== id.email) {
        setSuggestion(fix);
        return;
      }
      startEmail(id.email);
    } else if (id.kind === "phone") {
      loginPhone(id.phone);
    } else {
      setError("Введите телефон (например +7 999 123-45-67) или email");
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { ok, data } = await postJson("/api/auth/login-email", { email: sentEmail, password });
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
      await postJson("/api/auth/recover", { email: sentEmail });
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
    "shine press rounded-full bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/25 " +
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
            Проверьте <strong className="text-foreground">{sentEmail}</strong> — внутри кнопка
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
              autoFocus
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
            <button type="button" onClick={() => { setStep("input"); setPassword(""); setError(""); }} className="text-muted-foreground hover:text-foreground">
              ← Назад
            </button>
            <button type="button" onClick={recover} disabled={busy} className="text-primary hover:underline disabled:opacity-50">
              Прислать новый пароль
            </button>
          </div>
        </form>
      </div>
    );
  }

  // step === "input"
  const isRow = layout === "row";
  return (
    <form onSubmit={submit} className={isRow ? "w-full" : "w-full space-y-3"}>
      <div className={isRow ? "flex flex-col sm:flex-row gap-3" : "space-y-3"}>
        <label className="relative block flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <User className="w-5 h-5" />
          </span>
          <input
            type="text"
            inputMode="email"
            placeholder="Телефон или email"
            value={value}
            onChange={(e) => { setValue(e.target.value); setSuggestion(null); setError(""); }}
            autoComplete="username"
            required
            autoFocus={autoFocus}
            className={inputCls + (isRow ? " sm:py-4 sm:text-base" : "")}
          />
        </label>
        <button type="submit" disabled={busy} className={btnCls + (isRow ? " px-7 py-4 text-base whitespace-nowrap" : " w-full py-3")}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : submitLabel}
        </button>
      </div>

      {suggestion && (
        <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
          Возможно, вы имели в виду{" "}
          <button type="button" className="font-semibold underline" onClick={() => { setValue(suggestion); setSuggestion(null); }}>
            {suggestion}
          </button>
          ?{" "}
          <button type="button" className="text-muted-foreground underline" onClick={() => { setSuggestion(null); startEmail(value.trim().toLowerCase()); }}>
            оставить как есть
          </button>
        </p>
      )}
      {error && !suggestion && <p className="text-sm text-destructive mt-2">{error}</p>}
      {!isRow && (
        <p className="text-xs text-muted-foreground text-center">
          Телефон — вход как обычно. Email — регистрация за секунду, пароль придёт на почту.
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
        <p className="text-sm text-muted-foreground mb-5">Введите телефон или email — войдём или зарегистрируем.</p>
        <AuthForm layout="stacked" autoFocus />
      </div>
    </div>,
    document.body,
  );
}
