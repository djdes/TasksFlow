"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "true";
  const inviteAccepted = searchParams.get("invite") === "accepted";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        setError("Неверный email или пароль");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* Left: brand panel */}
      <aside className="relative hidden flex-col overflow-hidden bg-[#0b1024] p-12 text-white lg:flex">
        {/* Soft mesh gradient backdrop */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[520px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-40 -right-32 size-[560px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
          <div className="absolute left-1/3 top-1/2 size-[340px] rounded-full bg-[#3d4efc] opacity-30 blur-[100px]" />
        </div>
        {/* Grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at 40% 40%, black 40%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex flex-col">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <ShieldCheck className="size-5 text-white" />
            </div>
            <div className="text-[15px] font-semibold tracking-tight">
              HACCP-Online
            </div>
          </Link>
        </div>

        <div className="relative z-10 mt-auto max-w-[520px]">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] uppercase tracking-[0.18em] text-white/70 backdrop-blur">
            <span className="size-1.5 rounded-full bg-[#7cf5c0]" />
            35 СанПиН / ХАССП журналов
          </div>
          <h1 className="text-[46px] font-semibold leading-[1.05] tracking-[-0.03em]">
            Электронные журналы пищевого производства
          </h1>
          <p className="mt-5 max-w-[440px] text-[16px] leading-[1.6] text-white/70">
            Контроль температур, санитарии и прослеживаемости сырья — в одном
            месте. Telegram-уведомления, импорт iiko, печать в формате
            Роспотребнадзора.
          </p>

          <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] text-white/80">
            {[
              "Базовый + Расширенный тарифы",
              "Доступ по ролям и журналам",
              "Уведомления в Telegram",
              "Автозаполнение с датчиков",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[#7cf5c0]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex items-center gap-4 text-[12px] text-white/50">
            <span>© 2026 HACCP-Online</span>
            <span className="size-1 rounded-full bg-white/25" />
            <Link
              href="/register"
              className="underline-offset-4 hover:text-white hover:underline"
            >
              Зарегистрировать компанию
            </Link>
          </div>
        </div>
      </aside>

      {/* Right: auth card */}
      <main className="relative flex items-center justify-center px-6 py-12 sm:px-10">
        {/* Subtle paper grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(#d9dceb 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative w-full max-w-[420px]">
          {/* Mobile brand header */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-[#5566f6] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div className="text-[15px] font-semibold tracking-tight text-[#0b1024]">
              HACCP-Online
            </div>
          </div>

          <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.02em] text-[#0b1024] sm:text-[32px]">
            Вход в личный кабинет
          </h2>
          <p className="mt-2 text-[14px] text-[#6f7282]">
            Введите email и пароль, выданные вашей компанией.
          </p>

          {(registered || inviteAccepted) && (
            <div className="mt-6 flex items-start gap-2 rounded-2xl border border-[#c8f0d5] bg-[#effaf1] px-4 py-3 text-[13px] text-[#136b2a]">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>
                {registered
                  ? "Регистрация завершена. Войдите в систему."
                  : "Приглашение принято. Войдите под своим паролем."}
              </span>
            </div>
          )}

          {error && (
            <div
              className="mt-6 rounded-2xl border border-[#ffd2cd] bg-[#fff4f2] px-4 py-3 text-[13px] text-[#d2453d]"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field
              id="email"
              label="Email"
              type="email"
              value={formData.email}
              onChange={(v) => setFormData((p) => ({ ...p, email: v }))}
              placeholder="name@company.com"
              autoComplete="email"
              required
            />

            <Field
              id="password"
              label="Пароль"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(v) => setFormData((p) => ({ ...p, password: v }))}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              adornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="rounded-lg p-1 text-[#8a8ea4] transition-colors hover:text-[#5566f6] focus:outline-none focus-visible:text-[#5566f6]"
                  aria-label={
                    showPassword ? "Скрыть пароль" : "Показать пароль"
                  }
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              }
            />

            <button
              type="submit"
              disabled={loading}
              className="group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-[#5566f6] text-[15px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-all hover:bg-[#4a5bf0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5566f6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-70"
            >
              <span className="relative z-10">
                {loading ? "Вход..." : "Войти"}
              </span>
              {!loading && (
                <ArrowRight className="relative z-10 size-4 transition-transform group-hover:translate-x-0.5" />
              )}
              <span
                aria-hidden
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
              />
            </button>
          </form>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#ececf4]" />
            <span className="text-[12px] uppercase tracking-[0.2em] text-[#9b9fb3]">
              или
            </span>
            <div className="h-px flex-1 bg-[#ececf4]" />
          </div>

          <Link
            href="/register"
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#dcdfed] bg-white text-[15px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
          >
            Зарегистрировать компанию
            <ArrowRight className="size-4 text-[#5566f6]" />
          </Link>

          <p className="mt-8 text-center text-[12px] text-[#9b9fb3]">
            Забыли пароль? Попросите администратора вашей организации выслать
            приглашение повторно.
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  adornment,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  adornment?: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#0b1024]">
        {label}
      </span>
      <div className="group relative flex items-center">
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="peer h-11 w-full rounded-2xl border border-[#dcdfed] bg-white px-4 pr-11 text-[15px] text-[#0b1024] placeholder:text-[#c1c5d6] transition-[border-color,box-shadow] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15"
        />
        {adornment ? (
          <div className="absolute right-3 flex items-center">{adornment}</div>
        ) : null}
      </div>
    </label>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
