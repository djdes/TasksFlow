"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  BASIC_TARIFF_JOURNALS,
  EXTENDED_ONLY_TARIFF_JOURNALS,
} from "@/lib/journal-catalog";

const organizationTypes = [
  { value: "restaurant", label: "Ресторан / кафе" },
  { value: "meat", label: "Мясная продукция" },
  { value: "dairy", label: "Молочная продукция" },
  { value: "bakery", label: "Хлебобулочные изделия" },
  { value: "confectionery", label: "Кондитерские изделия" },
  { value: "other", label: "Другое" },
];

type Step = "details" | "verify" | "plan";

const STEPS: { id: Step; label: string; helper: string }[] = [
  { id: "details", label: "Компания", helper: "название, email, пароль" },
  { id: "verify", label: "Код", helper: "из письма" },
  { id: "plan", label: "Тариф", helper: "базовый / расширенный" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    organizationName: "",
    organizationType: "restaurant",
    inn: "",
    name: "",
    email: "",
    phone: "",
    password: "",
    code: "",
    plan: "basic" as "basic" | "extended",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Не удалось отправить код");
      }
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function finishRegistration(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Не удалось завершить регистрацию");
      }
      // Custom login endpoint overwrites the primary site cookie so we don't
      // inherit a stray impersonation session from earlier.
      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      if (!login.ok) {
        router.push("/login?registered=true");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const activeIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* Left panel — same brand rhythm as /login */}
      <aside className="relative hidden flex-col overflow-hidden bg-[#0b1024] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[520px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-40 -right-32 size-[560px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
          <div className="absolute left-1/3 top-1/2 size-[340px] rounded-full bg-[#3d4efc] opacity-30 blur-[100px]" />
        </div>
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

        <div className="relative z-10">
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
            <Sparkles className="size-3.5 text-[#7cf5c0]" />
            Бесплатно навсегда · без карты
          </div>
          <h1 className="text-[46px] font-semibold leading-[1.05] tracking-[-0.03em]">
            Зарегистрируйте компанию за 2 минуты
          </h1>
          <p className="mt-5 max-w-[440px] text-[16px] leading-[1.6] text-white/70">
            Подтвердите email, выберите набор журналов — и вся рутина ХАССП уже
            работает за вас. Приглашайте сотрудников, раздавайте доступ,
            собирайте подписи, печатайте в Роспотребнадзор.
          </p>

          <div className="mt-10 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="text-[12px] uppercase tracking-[0.2em] text-white/60">
              Базовый тариф включает
            </div>
            <ul className="grid grid-cols-1 gap-2 text-[14px] text-white/80">
              {BASIC_TARIFF_JOURNALS.slice(0, 6).map((j) => (
                <li key={j.code} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#7cf5c0]" />
                  <span className="truncate">{j.name}</span>
                </li>
              ))}
              <li className="pl-6 text-[13px] text-white/50">
                …и ещё {BASIC_TARIFF_JOURNALS.length - 6} обязательных журналов
                СанПиН
              </li>
            </ul>
          </div>

          <div className="mt-10 flex items-center gap-4 text-[12px] text-white/50">
            <span>© 2026 HACCP-Online</span>
            <span className="size-1 rounded-full bg-white/25" />
            <Link
              href="/login"
              className="underline-offset-4 hover:text-white hover:underline"
            >
              Уже есть аккаунт — войти
            </Link>
          </div>
        </div>
      </aside>

      {/* Right panel — wizard */}
      <main className="relative flex items-center justify-center px-6 py-10 sm:px-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(#d9dceb 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative w-full max-w-[480px]">
          {/* Mobile brand */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-[#5566f6] text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div className="text-[15px] font-semibold tracking-tight text-[#0b1024]">
              HACCP-Online
            </div>
          </div>

          <StepIndicator activeIndex={activeIndex} />

          <h2 className="mt-8 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-[#0b1024] sm:text-[32px]">
            {step === "details" && "Создание компании"}
            {step === "verify" && "Подтверждение email"}
            {step === "plan" && "Выбор тарифа"}
          </h2>
          <p className="mt-2 text-[14px] text-[#6f7282]">
            {step === "details" &&
              "Заполните данные организации и создайте администратора."}
            {step === "verify" && (
              <>
                Мы отправили код на{" "}
                <span className="font-medium text-[#0b1024]">{form.email}</span>
                . Проверьте почту.
              </>
            )}
            {step === "plan" &&
              "Можно будет изменить позже в настройках подписки."}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-2xl border border-[#ffd2cd] bg-[#fff4f2] px-4 py-3 text-[13px] text-[#d2453d]"
            >
              {error}
            </div>
          )}

          {step === "details" && (
            <form onSubmit={submitDetails} className="mt-8 space-y-5">
              <Field
                id="organizationName"
                label="Название организации"
                value={form.organizationName}
                onChange={(v) => update("organizationName", v)}
                placeholder="ООО «Вкусный дом»"
                required
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_1fr]">
                <SelectField
                  id="organizationType"
                  label="Тип организации"
                  value={form.organizationType}
                  onChange={(v) => update("organizationType", v)}
                  options={organizationTypes}
                />
                <Field
                  id="inn"
                  label="ИНН"
                  value={form.inn}
                  onChange={(v) => update("inn", v)}
                  placeholder="опционально"
                  inputMode="numeric"
                />
              </div>
              <Field
                id="name"
                label="Ваше имя"
                value={form.name}
                onChange={(v) => update("name", v)}
                placeholder="Иван Петров"
                required
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  id="email"
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(v) => update("email", v)}
                  placeholder="name@company.com"
                  autoComplete="email"
                  required
                />
                <Field
                  id="phone"
                  label="Телефон"
                  type="tel"
                  value={form.phone}
                  onChange={(v) => update("phone", v)}
                  placeholder="+7 ..."
                  autoComplete="tel"
                />
              </div>
              <Field
                id="password"
                label="Пароль"
                type="password"
                value={form.password}
                onChange={(v) => update("password", v)}
                placeholder="минимум 6 символов"
                autoComplete="new-password"
                minLength={6}
                required
              />
              <PrimaryButton type="submit" loading={loading}>
                {loading ? "Отправка…" : "Получить код на email"}
              </PrimaryButton>
            </form>
          )}

          {step === "verify" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                if (form.code.length !== 6) {
                  setError("Введите 6-значный код");
                  return;
                }
                setStep("plan");
              }}
              className="mt-8 space-y-5"
            >
              <label htmlFor="code" className="block">
                <span className="mb-2 block text-[13px] font-medium text-[#0b1024]">
                  Код подтверждения
                </span>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={form.code}
                  onChange={(e) =>
                    update("code", e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="h-16 w-full rounded-2xl border border-[#dcdfed] bg-white text-center text-[28px] font-semibold tracking-[0.42em] text-[#0b1024] placeholder:text-[#c1c5d6] transition-[border-color,box-shadow] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15"
                  placeholder="••••••"
                />
                <p className="mt-2 text-[12px] text-[#9b9fb3]">
                  Код действителен 10 минут. Не получили? Попробуйте ещё раз
                  или проверьте папку «Спам».
                </p>
              </label>

              <div className="flex items-center gap-3">
                <SecondaryButton
                  type="button"
                  onClick={() => setStep("details")}
                >
                  <ArrowLeft className="size-4" />
                  Изменить данные
                </SecondaryButton>
                <PrimaryButton type="submit" loading={false}>
                  Далее
                </PrimaryButton>
              </div>
            </form>
          )}

          {step === "plan" && (
            <form onSubmit={finishRegistration} className="mt-8 space-y-4">
              <PlanCard
                selected={form.plan === "basic"}
                badge="13 журналов"
                title="Базовый"
                price="от 0 ₽ · пробный период"
                description="Всё обязательное по СанПиН для кафе / ресторана / производства."
                onSelect={() => update("plan", "basic")}
              />
              <PlanCard
                selected={form.plan === "extended"}
                badge={`${BASIC_TARIFF_JOURNALS.length + EXTENDED_ONLY_TARIFF_JOURNALS.length} журналов`}
                title="Расширенный"
                price="рекомендуем"
                description={`Базовый + ещё ${EXTENDED_ONLY_TARIFF_JOURNALS.length} журналов (обучение, дезинфектанты, санитарный день и пр.)`}
                onSelect={() => update("plan", "extended")}
                highlight
              />

              <div className="flex items-center gap-3 pt-2">
                <SecondaryButton
                  type="button"
                  onClick={() => setStep("verify")}
                >
                  <ArrowLeft className="size-4" />
                  Назад
                </SecondaryButton>
                <PrimaryButton type="submit" loading={loading}>
                  {loading ? "Создание…" : "Создать аккаунт"}
                </PrimaryButton>
              </div>
            </form>
          )}

          <p className="mt-8 text-center text-[12px] text-[#9b9fb3]">
            Регистрируясь, вы соглашаетесь с политикой обработки персональных
            данных.
          </p>
        </div>
      </main>
    </div>
  );
}

function StepIndicator({ activeIndex }: { activeIndex: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-3">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${
                done
                  ? "bg-[#5566f6] text-white"
                  : active
                    ? "bg-[#0b1024] text-white"
                    : "bg-[#eceef7] text-[#9b9fb3]"
              }`}
            >
              {done ? <CheckCircle2 className="size-4" /> : i + 1}
            </div>
            <div className="hidden min-w-0 flex-1 sm:block">
              <div
                className={`truncate text-[12px] font-medium ${
                  active ? "text-[#0b1024]" : "text-[#6f7282]"
                }`}
              >
                {s.label}
              </div>
              <div className="truncate text-[11px] text-[#9b9fb3]">
                {s.helper}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`hidden h-px flex-1 sm:block ${
                  done ? "bg-[#5566f6]" : "bg-[#eceef7]"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  minLength,
  inputMode,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  inputMode?: "numeric" | "text" | "tel" | "email";
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#0b1024]">
        {label}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        inputMode={inputMode}
        className="h-11 w-full rounded-2xl border border-[#dcdfed] bg-white px-4 text-[15px] text-[#0b1024] placeholder:text-[#c1c5d6] transition-[border-color,box-shadow] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15"
      />
    </label>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#0b1024]">
        {label}
      </span>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none rounded-2xl border border-[#dcdfed] bg-white px-4 pr-10 text-[15px] text-[#0b1024] transition-[border-color,box-shadow] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#8a8ea4]" />
      </div>
    </label>
  );
}

function PrimaryButton({
  type = "button",
  children,
  loading,
  onClick,
}: {
  type?: "button" | "submit";
  children: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className="group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-[#5566f6] text-[15px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-all hover:bg-[#4a5bf0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5566f6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-70"
    >
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
        {!loading && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
        {loading && <Loader2 className="size-4 animate-spin" />}
      </span>
      <span
        aria-hidden
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />
    </button>
  );
}

function SecondaryButton({
  type = "button",
  children,
  onClick,
}: {
  type?: "button" | "submit";
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[14px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
    >
      {children}
    </button>
  );
}

function PlanCard({
  selected,
  title,
  badge,
  price,
  description,
  onSelect,
  highlight,
}: {
  selected: boolean;
  title: string;
  badge: string;
  price: string;
  description: string;
  onSelect: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full overflow-hidden rounded-2xl border-2 p-5 text-left transition-all ${
        selected
          ? "border-[#5566f6] bg-gradient-to-br from-[#f5f6ff] to-[#fafbff] shadow-[0_12px_32px_-16px_rgba(85,102,246,0.4)]"
          : "border-[#ececf4] bg-white hover:border-[#c7ccea]"
      }`}
    >
      {highlight && !selected && (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#eef1ff] px-2.5 py-1 text-[11px] font-medium text-[#5566f6]">
          <Sparkles className="size-3" />
          рекомендуем
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-semibold tracking-tight text-[#0b1024]">
            {title}
          </div>
          <div className="mt-1 text-[13px] text-[#6f7282]">{price}</div>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-[12px] font-semibold tabular-nums ${
            selected
              ? "bg-[#5566f6] text-white"
              : "bg-[#eef1ff] text-[#5566f6]"
          }`}
        >
          {badge}
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-[1.55] text-[#6f7282]">
        {description}
      </p>
      <div className="mt-4 flex items-center gap-2 text-[12px] font-medium text-[#5566f6]">
        <span
          className={`flex size-4 items-center justify-center rounded-full border-2 transition-all ${
            selected
              ? "border-[#5566f6] bg-[#5566f6]"
              : "border-[#c7ccea] bg-white"
          }`}
        >
          {selected && <span className="size-1.5 rounded-full bg-white" />}
        </span>
        {selected ? "Выбран" : "Выбрать тариф"}
      </div>
    </button>
  );
}
