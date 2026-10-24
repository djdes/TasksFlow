import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, CreditCard, Plus, RefreshCw, Trash2, Undo2, Wallet, X } from "lucide-react";
import { PLANS } from "@shared/plans";
import {
  BILLING_MONTHS,
  formatRub,
  ORDER_STATUS_LABEL,
  PAID_PLAN_IDS,
  periodLabel,
  REFUND_STATUS_LABEL,
  type BillingCheckResult,
  type BillingDiagnostics,
  type PlanPrice,
  type ReconcileResult,
  type RefundResult,
  type RootBillingOrder,
} from "@shared/billing";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

type RootBilling = { prices: PlanPrice[]; orders: RootBillingOrder[] };

const KEY = ["root-billing"];
const DIAG_KEY = ["root-billing-diagnostics"];
const shortDate = (sec: number) => new Date(sec * 1000).toLocaleDateString("ru-RU");

/**
 * POST в root API с долгим таймаутом: возврат ждёт двух запросов к кассе
 * (до ~45 секунд), обычные 30 секунд оборвали бы его на середине.
 */
async function rootPost<T>(url: string, body?: unknown, timeoutMs = 60_000): Promise<T> {
  const res = await apiRequest("POST", url, body, timeoutMs);
  return res.json();
}

/**
 * Root: подключение кассы (что задано, адреса для «Технических
 * настроек», проверка без денег), цены тарифов и последние платежи всех
 * компаний со сверкой и возвратом. Нет цены у тарифа — онлайн его не
 * купить, на лендинге «по запросу».
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
      <CashboxPanel />
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
                    {o.refundStatus && o.status !== "refunded" && (
                      <span className={`billing-chip ${o.refundStatus === "uncertain" || o.refundStatus === "canceled" ? "is-warn" : "is-muted"}`}>
                        {REFUND_STATUS_LABEL[o.refundStatus]}
                      </span>
                    )}
                  </p>
                  <p className="billing-order-meta">
                    №{o.id} · {shortDate(o.paidAt ?? o.createdAt)}
                    {o.email ? ` · ${o.email}` : ""}
                  </p>
                  <OrderActions order={o} />
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

// --- Касса ---------------------------------------------------------------------------

function CashboxPanel() {
  const query = useQuery<BillingDiagnostics>({
    queryKey: DIAG_KEY,
    queryFn: async ({ signal }) => {
      const res = await fetchOrFriendlyError("/api/root/billing/diagnostics", { credentials: "include", signal: withTimeout(signal, 30_000) });
      const data = (await res.json().catch(() => null)) as Partial<BillingDiagnostics> | null;
      // Старый сервер (без диагностики) или прокси отдали не то — ошибка с повтором, а не падение страницы.
      if (!res.ok || !data?.secrets || !data.urls || !data.stats) throw new Error("Не удалось загрузить настройки кассы");
      return data as BillingDiagnostics;
    },
  });
  const [result, setResult] = useState<BillingCheckResult | null>(null);
  const check = useMutation({
    mutationFn: () => rootPost<BillingCheckResult>("/api/root/billing/check", undefined, 30_000),
    onSuccess: setResult,
    onError: (err: Error) => setResult({ ok: false, message: err.message }),
  });

  return (
    <section className="content-panel" aria-labelledby="root-cashbox-title">
      <div className="section-title">
        <Wallet className="w-5 h-5 text-primary" />
        <h2 id="root-cashbox-title">Касса</h2>
        {query.data && (
          <span className={`billing-chip ${!query.data.configured ? "is-warn" : query.data.testMode ? "is-warn" : "is-ok"}`}>
            {!query.data.configured ? "не настроена" : query.data.testMode ? "тестовый режим" : "принимает оплату"}
          </span>
        )}
      </div>
      {query.isLoading ? (
        <ListSkeleton rows={3} />
      ) : query.isError || !query.data ? (
        <QueryError onRetry={() => void query.refetch()} />
      ) : (
        <CashboxBody diag={query.data} result={result} checking={check.isPending} onCheck={() => check.mutate()} />
      )}
    </section>
  );
}

function CashboxBody({ diag, result, checking, onCheck }: { diag: BillingDiagnostics; result: BillingCheckResult | null; checking: boolean; onCheck: () => void }) {
  const s = diag.secrets;
  const items: Array<{ ok: boolean; label: string; hint: string; optional?: boolean }> = [
    { ok: s.login, label: "Логин магазина", hint: "ROBOKASSA_MERCHANT_LOGIN" },
    { ok: s.password1, label: "Пароль #1", hint: "подпись оплаты и автосписаний" },
    { ok: s.password2, label: "Пароль #2", hint: "уведомления об оплате и сверка" },
    ...(diag.testMode || s.testPassword1 || s.testPassword2
      ? [
          { ok: s.testPassword1, label: "Тестовый пароль #1", hint: "оплата в тестовом режиме" },
          { ok: s.testPassword2, label: "Тестовый пароль #2", hint: "уведомления в тестовом режиме" },
        ]
      : []),
    { ok: s.password3, label: "Пароль #3", hint: "возвраты кнопкой отсюда; без него — в кабинете кассы", optional: true },
    { ok: diag.recurring, label: "Автопродление", hint: "рекуррентные платежи включает Робокасса по заявке", optional: true },
    { ok: diag.receipt, label: "Чеки", hint: diag.receipt ? `54-ФЗ, НДС: ${diag.tax}${diag.sno ? `, СНО: ${diag.sno}` : ""}` : "54-ФЗ: Робочеки или своя касса", optional: true },
  ];
  const st = diag.stats;
  const n = (status: string) => st.byStatus[status] ?? 0;

  return (
    <div className="root-cashbox">
      <ul className="root-cashbox-list" aria-label="Настройки кассы">
        {items.map((item) => (
          <li key={item.label} className={item.ok ? "is-ok" : item.optional ? "is-off" : "is-missing"}>
            {item.ok ? <Check aria-hidden /> : <X aria-hidden />}
            <span>
              <b>{item.label}</b>
              <span className="sr-only">{item.ok ? " — задан" : " — не задан"}</span> · {item.hint}
            </span>
          </li>
        ))}
      </ul>

      <div className="root-cashbox-urls">
        <p className="text-sm text-muted-foreground">
          В «Технических настройках» магазина: метод отсылки данных — <b>POST</b>, алгоритм хеша — <b>{diag.hash.toUpperCase()}</b>.
        </p>
        <CopyRow label="Result URL" value={diag.urls.result} />
        <CopyRow label="Success URL" value={diag.urls.success} />
        <CopyRow label="Fail URL" value={diag.urls.fail} />
      </div>

      {!st.tables ? (
        <p className="root-cashbox-result is-fail" role="alert">
          Таблицы оплаты не созданы — запустите <code>npm run add-billing</code> на сервере.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Оплачено: {n("paid")} · ждут оплаты: {n("pending")} · возвращено: {n("refunded")} · автопродлений: {st.activeSeries}
          {st.lastPaidAt ? ` · последняя оплата ${shortDate(st.lastPaidAt)}` : ""}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" loading={checking} loadingLabel="Спрашиваем кассу…" onClick={onCheck}>
          <RefreshCw /> Проверить подключение
        </Button>
        <span className="text-xs text-muted-foreground">Без денег: проверяет логин и Пароль #2. Пароль #1 проверит тестовый платёж.</span>
      </div>
      {result && (
        <p className={`root-cashbox-result ${result.ok ? "is-ok" : "is-fail"}`} role="status">
          {result.message}
        </p>
      )}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} скопирован` });
    } catch {
      toast({ title: "Не скопировалось", description: "Выделите адрес и скопируйте вручную.", variant: "destructive" });
    }
  };
  return (
    <div className="root-cashbox-url">
      <span className="root-cashbox-url-label">{label}</span>
      <code>{value}</code>
      <Button type="button" variant="ghost" size="icon" aria-label={`Скопировать ${label}`} onClick={() => void copy()}>
        <Copy />
      </Button>
    </div>
  );
}

// --- Действия с заказом ------------------------------------------------------------------

function OrderActions({ order }: { order: RootBillingOrder }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: KEY }), queryClient.invalidateQueries({ queryKey: DIAG_KEY })]);
  // Касса не ответила на прошлый возврат: повтор — только с подтверждением.
  const retry = order.status === "paid" && order.refundStatus === "uncertain";

  const reconcile = useMutation({
    mutationFn: () => rootPost<ReconcileResult>(`/api/root/billing/orders/${order.id}/reconcile`, undefined, 30_000),
    onSuccess: async (data) => {
      await refresh();
      toast({
        title: data.status === "paid" ? "Оплата засчитана" : data.status === "error" ? "Касса не ответила" : `Заказ №${order.id}`,
        description: data.message,
        variant: data.status === "error" ? "destructive" : undefined,
      });
    },
    onError: (err: Error) => toast({ title: "Не удалось сверить", description: err.message, variant: "destructive" }),
  });

  const refund = useMutation({
    // Повтор после «касса не ответила» — с force: root подтвердил, что проверил кабинет.
    mutationFn: () => rootPost<RefundResult>(`/api/root/billing/orders/${order.id}/refund`, retry ? { force: true } : undefined),
    onSuccess: async (data) => {
      setConfirm(false);
      await refresh();
      toast({ title: "Возврат", description: data.message });
    },
    onError: async (err: Error) => {
      setRefundError(err.message);
      await refresh();
    },
  });

  const canRefund = order.status === "paid" && !order.isTest && (order.refundStatus === null || order.refundStatus === "canceled" || retry);
  const canCheck = order.status !== "refunded";
  if (!canRefund && !canCheck) return null;

  return (
    <div className="root-order-actions">
      {canCheck && (
        <Button type="button" variant="ghost" size="sm" loading={reconcile.isPending} loadingLabel="Сверяем…" onClick={() => reconcile.mutate()}>
          <RefreshCw /> Проверить в кассе
        </Button>
      )}
      {canRefund && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setRefundError(null);
            setConfirm(true);
          }}
        >
          <Undo2 /> {retry ? "Повторить возврат" : "Вернуть деньги"}
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={retry ? `Повторить возврат ${formatRub(order.amountRub)}?` : `Вернуть ${formatRub(order.amountRub)}?`}
        description={
          retry ? (
            <>
              <p>
                Касса не подтвердила прошлый возврат по заказу №{order.id}. Повторяйте, только если в кабинете Робокассы видно, что деньги не вернулись: иначе вернёте дважды.
              </p>
              <p>Перед отправкой спросим кассу ещё раз — если возврат уже прошёл, повторно не отправим.</p>
            </>
          ) : (
            <>
              <p>
                Заказ №{order.id}, «{order.companyName ?? `компания #${order.companyId}`}». Касса вернёт всю сумму на карту плательщика — отменить возврат нельзя.
              </p>
              <p>Если это последняя оплата компании, тариф и срок вернутся к тем, что были до неё. Автопродление этой серии выключится.</p>
            </>
          )
        }
        confirmLabel={retry ? "Повторить возврат" : "Вернуть деньги"}
        confirmWord={retry ? "ВЕРНУТЬ" : undefined}
        destructive
        busy={refund.isPending}
        error={refundError}
        onConfirm={() => refund.mutate()}
      />
    </div>
  );
}

// --- Цены -------------------------------------------------------------------------------

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
