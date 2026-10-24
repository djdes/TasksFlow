import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, Trash2 } from "lucide-react";
import { PLANS } from "@shared/plans";
import { BILLING_MONTHS, formatRub, ORDER_STATUS_LABEL, PAID_PLAN_IDS, periodLabel, type BillingOrder, type PlanPrice } from "@shared/billing";
import { ListSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

type RootOrder = BillingOrder & { companyId: number; companyName: string | null; email: string | null };
type RootBilling = { prices: PlanPrice[]; orders: RootOrder[] };

const KEY = ["root-billing"];
const shortDate = (sec: number) => new Date(sec * 1000).toLocaleDateString("ru-RU");

/**
 * Root: цены тарифов (их видят лендинг и страница оплаты) и последние
 * платежи всех компаний. Нет цены у тарифа — онлайн его не купить,
 * на лендинге «по запросу». Сумма действующих автопродлений не меняется.
 */
export function RootBillingPanel() {
  const query = useQuery<RootBilling>({
    queryKey: KEY,
    queryFn: async ({ signal }) => {
      const res = await fetchOrFriendlyError("/api/root/billing", { credentials: "include", signal: withTimeout(signal, 30_000) });
      if (!res.ok) throw new Error("Не удалось загрузить платежи");
      const data = (await res.json()) as Partial<RootBilling> | null;
      return { prices: Array.isArray(data?.prices) ? data.prices : [], orders: Array.isArray(data?.orders) ? data.orders : [] };
    },
  });

  return (
    <>
      <section className="content-panel" aria-labelledby="root-prices-title">
        <div className="section-title">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 id="root-prices-title">Цены тарифов</h2>
        </div>
        {query.isLoading ? <ListSkeleton rows={2} /> : query.isError || !query.data ? <QueryError onRetry={() => void query.refetch()} /> : <PricesEditor prices={query.data.prices} />}
      </section>
      <section className="content-panel" aria-labelledby="root-payments-title">
        <div className="section-title">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 id="root-payments-title">Платежи</h2>
        </div>
        {query.isLoading ? (
          <ListSkeleton rows={3} />
        ) : query.isError || !query.data ? (
          <QueryError onRetry={() => void query.refetch()} />
        ) : query.data.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Платежей пока не было.</p>
        ) : (
          <ul className="billing-orders">
            {query.data.orders.map((o) => (
              <li key={o.id} className="billing-order">
                <div className="min-w-0">
                  <p className="billing-order-title">
                    {o.companyName ?? `Компания #${o.companyId}`} · {PLANS[o.plan].name} на {periodLabel(o.months)}
                    {o.automatic && <span className="billing-chip is-muted">автопродление</span>}
                    {o.isTest && <span className="billing-chip is-warn">тест</span>}
                  </p>
                  <p className="billing-order-meta">
                    №{o.id} · {shortDate(o.paidAt ?? o.createdAt)}
                    {o.email ? ` · ${o.email}` : ""}
                  </p>
                </div>
                <div className="billing-order-side">
                  <b>{formatRub(o.amountRub)}</b>
                  <span className={`billing-chip ${o.status === "paid" ? "is-ok" : o.status === "pending" ? "is-warn" : "is-muted"}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function PricesEditor({ prices }: { prices: PlanPrice[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rows, setRows] = useState<PlanPrice[]>(prices);
  useEffect(() => setRows(prices), [prices]);
  const save = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/root/billing/prices", { prices: rows }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KEY });
      toast({ title: "Цены сохранены", description: "Лендинг и страница оплаты обновятся в течение минуты." });
    },
    onError: (err: Error) => toast({ title: "Не сохранилось", description: err.message, variant: "destructive" }),
  });
  const update = (i: number, patch: Partial<PlanPrice>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dirty = JSON.stringify(rows) !== JSON.stringify(prices);

  return (
    <div className="root-prices">
      <p className="text-sm text-muted-foreground">
        Тариф без цены онлайн не купить — на лендинге он «по запросу». Новая цена не меняет сумму уже включённых автопродлений.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="root-price">
          <select className="reports-select" aria-label="Тариф" value={row.plan} onChange={(e) => update(i, { plan: e.target.value as PlanPrice["plan"] })}>
            {PAID_PLAN_IDS.map((id) => (
              <option key={id} value={id}>
                {PLANS[id].name}
              </option>
            ))}
          </select>
          <select className="reports-select" aria-label="Срок" value={row.months} onChange={(e) => update(i, { months: Number(e.target.value) as PlanPrice["months"] })}>
            {BILLING_MONTHS.map((m) => (
              <option key={m} value={m}>
                {periodLabel(m)}
              </option>
            ))}
          </select>
          <input
            className="root-price-input"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            aria-label="Цена, ₽"
            value={row.priceRub}
            onChange={(e) => update(i, { priceRub: Math.round(Number(e.target.value)) || 0 })}
          />
          <span className="text-sm text-muted-foreground">₽</span>
          <Button type="button" variant="ghost" size="icon" aria-label="Убрать цену" onClick={() => setRows((list) => list.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((list) => [...list, { plan: "team", months: 12, priceRub: 9900 }])}>
          <Plus /> Добавить цену
        </Button>
        <Button type="button" size="sm" disabled={!dirty} loading={save.isPending} loadingLabel="Сохраняем…" onClick={() => save.mutate()}>
          Сохранить цены
        </Button>
      </div>
    </div>
  );
}
