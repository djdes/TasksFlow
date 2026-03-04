"use client";

import { useState } from "react";
import { Check, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Plan {
  id: string;
  name: string;
  price: number;
  maxUsers: number | null;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Стартовый",
    price: 3000,
    maxUsers: 3,
    features: [
      "До 3 пользователей",
      "Базовые журналы",
      "PDF-отчёты",
      "Email-уведомления",
    ],
  },
  {
    id: "standard",
    name: "Стандарт",
    price: 5000,
    maxUsers: 10,
    features: [
      "До 10 пользователей",
      "Все журналы",
      "IoT-мониторинг",
      "Telegram-уведомления",
      "Excel-экспорт",
      "Сканер штрих-кодов",
    ],
  },
  {
    id: "pro",
    name: "Про",
    price: 8000,
    maxUsers: null,
    features: [
      "Безлимит пользователей",
      "Всё из Стандарт",
      "Приоритетная поддержка",
      "API-доступ",
      "White-label",
      "ФГИС Меркурий",
    ],
  },
];

const PLAN_LABELS: Record<string, string> = {
  trial: "Пробный период",
  starter: "Стартовый",
  standard: "Стандарт",
  pro: "Про",
};

interface SubscriptionManagerProps {
  currentPlan: string;
  subscriptionEnd: string | null;
  activeUsers: number;
}

export function SubscriptionManager({
  currentPlan,
  subscriptionEnd,
  activeUsers,
}: SubscriptionManagerProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTrial = currentPlan === "trial";
  const isExpired = subscriptionEnd
    ? new Date(subscriptionEnd) < new Date()
    : false;

  async function handleSubscribe(planId: string) {
    setLoading(planId);
    setError(null);

    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка");
      }

      const { confirmationUrl } = await res.json();
      window.location.href = confirmationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка оплаты");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Current plan info */}
      <Card>
        <CardHeader>
          <CardTitle>Текущий тариф</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge
              variant={isTrial || isExpired ? "destructive" : "default"}
              className="text-sm px-3 py-1"
            >
              {PLAN_LABELS[currentPlan] || currentPlan}
            </Badge>
            {isExpired && (
              <Badge variant="destructive">Истёк</Badge>
            )}
          </div>
          {subscriptionEnd && (
            <p className="text-sm text-muted-foreground">
              Действует до:{" "}
              <span className="font-medium">
                {new Date(subscriptionEnd).toLocaleDateString("ru-RU")}
              </span>
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Активных пользователей: <span className="font-medium">{activeUsers}</span>
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Plans grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const isPopular = plan.id === "standard";

          return (
            <Card
              key={plan.id}
              className={`relative ${
                isPopular ? "border-primary shadow-md" : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    Популярный
                  </Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">
                    {plan.price.toLocaleString("ru-RU")} ₽
                  </span>
                  <span className="text-muted-foreground"> / мес</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="size-4 text-green-600 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isCurrent ? "outline" : isPopular ? "default" : "outline"}
                  disabled={isCurrent || loading !== null}
                  onClick={() => handleSubscribe(plan.id)}
                >
                  {loading === plan.id ? (
                    "Загрузка..."
                  ) : isCurrent ? (
                    "Текущий тариф"
                  ) : (
                    <>
                      <CreditCard className="size-4 mr-2" />
                      Оплатить
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
