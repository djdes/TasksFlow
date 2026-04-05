import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";

// NOTE: detail page /plans/[id] is not yet implemented — render plan cards
// without a <Link> wrapper so clicks don't land on a 404.

type PlanItem = { sku: string; targetQuantity: number; actualQuantity?: number; priority?: string };

function getPlanItems(items: unknown): PlanItem[] {
  if (Array.isArray(items)) return items as PlanItem[];
  return [];
}

const SHIFT_LABELS: Record<string, string> = {
  morning: "Утро",
  evening: "Вечер",
  night: "Ночь",
};

export default async function PlansPage() {
  const session = await requireAuth();

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const plans = await db.productionPlan.findMany({
    where: {
      organizationId: session.user.organizationId,
      date: { gte: weekStart, lte: weekEnd },
    },
    orderBy: { date: "asc" },
  });

  // Build week days
  const days: { date: Date; label: string; plans: typeof plans }[] = [];
  const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dayPlans = plans.filter((p) => {
      const pd = new Date(p.date);
      return pd.toDateString() === d.toDateString();
    });
    days.push({
      date: d,
      label: `${dayNames[i]} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`,
      plans: dayPlans,
    });
  }

  const todayStr = new Date().toDateString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Производственный план</h1>
          <p className="mt-1 text-muted-foreground">Неделя: {weekStart.toLocaleDateString("ru-RU")} — {weekEnd.toLocaleDateString("ru-RU")}</p>
        </div>
        <Button asChild>
          <Link href="/plans/new">
            <Plus className="size-4" />
            Новый план
          </Link>
        </Button>
      </div>

      {/* Weekly grid */}
      <div className="grid gap-3 lg:grid-cols-7">
        {days.map((day) => {
          const isToday = day.date.toDateString() === todayStr;

          return (
            <Card key={day.label} className={isToday ? "border-primary ring-1 ring-primary" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm ${isToday ? "text-primary" : ""}`}>
                  {day.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {day.plans.map((plan) => {
                  const items = getPlanItems(plan.items);
                  const totalTarget = items.reduce((s, i) => s + i.targetQuantity, 0);
                  const totalActual = items.reduce((s, i) => s + (i.actualQuantity || 0), 0);
                  const completion = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

                  return (
                    <div key={plan.id} className="rounded-md border p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">
                          {SHIFT_LABELS[plan.shift] || plan.shift}
                        </Badge>
                        <Badge variant={plan.status === "completed" ? "default" : "secondary"} className="text-[10px]">
                          {plan.status === "draft" ? "Черновик" : plan.status === "active" ? "Активен" : "Выполнен"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{items.length} SKU</p>
                      {plan.status !== "draft" && totalTarget > 0 && (
                        <div className="space-y-0.5">
                          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${completion >= 100 ? "bg-green-500" : completion >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${Math.min(completion, 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">{completion}%</p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {day.plans.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">—</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
