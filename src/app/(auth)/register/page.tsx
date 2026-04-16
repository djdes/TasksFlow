"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BASIC_TARIFF_JOURNALS,
  EXTENDED_ONLY_TARIFF_JOURNALS,
} from "@/lib/journal-catalog";

const organizationTypes = [
  { value: "meat", label: "Мясная продукция" },
  { value: "dairy", label: "Молочная продукция" },
  { value: "bakery", label: "Хлебобулочные изделия" },
  { value: "confectionery", label: "Кондитерские изделия" },
  { value: "restaurant", label: "Ресторан / кафе" },
  { value: "other", label: "Другое" },
];

type Step = "details" | "verify" | "plan";

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
      // Sign in via the custom /api/auth/login endpoint (not next-auth/react
      // signIn) so we overwrite the site's primary session cookie
      // `haccp-online.session-token` that server components read. If a
      // root/impersonation cookie from a previous login is still in the
      // browser, signIn() would leave it intact and the user would land in
      // someone else's organisation.
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

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-2xl">Регистрация</CardTitle>
        <CardDescription>
          {step === "details" && "Шаг 1 из 3 — данные организации"}
          {step === "verify" && "Шаг 2 из 3 — код из письма"}
          {step === "plan" && "Шаг 3 из 3 — выбор тарифа"}
        </CardDescription>
      </CardHeader>

      {step === "details" && (
        <form onSubmit={submitDetails}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="organizationName">Название организации</Label>
              <Input
                id="organizationName"
                value={form.organizationName}
                onChange={(e) => update("organizationName", e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Тип организации</Label>
                <Select
                  value={form.organizationType}
                  onValueChange={(v) => update("organizationType", v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {organizationTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inn">ИНН (необязательно)</Label>
                <Input
                  id="inn"
                  value={form.inn}
                  onChange={(e) => update("inn", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Ваше имя</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Телефон</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                required
                minLength={6}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Получить код на email
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Уже есть аккаунт?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Войти
              </Link>
            </p>
          </CardFooter>
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
        >
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}
            <p className="text-sm text-muted-foreground">
              Мы отправили 6-значный код на <strong>{form.email}</strong>. Введите его ниже.
            </p>
            <div className="space-y-2">
              <Label htmlFor="code">Код подтверждения</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => update("code", e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoFocus
                required
                className="text-center tracking-[0.3em] text-2xl font-semibold"
              />
            </div>
            <button
              type="button"
              onClick={() => setStep("details")}
              className="text-sm text-primary hover:underline"
            >
              Изменить email
            </button>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full">
              Далее
              <ArrowRight className="size-4" />
            </Button>
          </CardFooter>
        </form>
      )}

      {step === "plan" && (
        <form onSubmit={finishRegistration}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}
            <PlanCard
              selected={form.plan === "basic"}
              title="Базовый"
              count={BASIC_TARIFF_JOURNALS.length}
              description="13 обязательных журналов СанПиН для ресторанов и кафе"
              onSelect={() => update("plan", "basic")}
            />
            <PlanCard
              selected={form.plan === "extended"}
              title="Расширенный"
              count={BASIC_TARIFF_JOURNALS.length + EXTENDED_ONLY_TARIFF_JOURNALS.length}
              description={`Всё из Базового + ${EXTENDED_ONLY_TARIFF_JOURNALS.length} дополнительных журналов`}
              onSelect={() => update("plan", "extended")}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Создать аккаунт
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

function PlanCard({
  selected,
  title,
  count,
  description,
  onSelect,
}: {
  selected: boolean;
  title: string;
  count: number;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border-2 p-4 text-left transition ${
        selected
          ? "border-[#5566f6] bg-[#f4f6ff]"
          : "border-[#ececf4] hover:border-[#d6d9ee]"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[17px] font-semibold text-black">{title}</div>
          <div className="mt-1 text-[14px] text-[#6f7282]">{description}</div>
        </div>
        <div className="text-right">
          <div className="text-[24px] font-bold text-[#5566f6]">{count}</div>
          <div className="text-[12px] text-[#8a8ea4]">журналов</div>
        </div>
      </div>
    </button>
  );
}
