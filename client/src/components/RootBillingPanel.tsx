import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, CircleCheck, Copy, CreditCard, Download, Plus, RefreshCw, Ticket, Trash2, Undo2, Wallet, X } from "lucide-react";
import { PLANS } from "@shared/plans";
import {
  BILLING_MONTHS,
  formatRub,
  LIFETIME_MAX_PERCENT,
  ORDER_STATUS_LABEL,
  PAID_PLAN_IDS,
  periodLabel,
  promoLabel,
  REFUND_STATUS_LABEL,
  type BillingCheckResult,
  type BillingDiagnostics,
  type PlanPrice,
  type PromoKind,
  type RootPromoCode,
  type ReconcileResult,
  type RefundResult,
  type RootBillingOrder,
} from "@shared/billing";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { invoicePdfUrl, updPdfUrl } from "@/lib/billing-api";
import { BalancesPanel, LifetimeDiscountsPanel, PromotionsPanel } from "@/components/RootBillingExtras";
import { apiRequest, fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

type RootBilling = { prices: PlanPrice[]; orders: RootBillingOrder[] };

const KEY = ["root-billing"];
const DIAG_KEY = ["root-billing-diagnostics"];
const PROMO_KEY = ["root-billing-promo"];
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
 * настроек», проверка без денег, готовность счетов и УПД), цены тарифов,
 * промокоды и последние платежи всех компаний: сверка и возврат по
 * карте, отметка оплаты по счёту, документы. Нет цены у тарифа — онлайн
 * его не купить, на лендинге «по запросу».
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
      <PromotionsPanel />
      <PromoCodesPanel />
      <LifetimeDiscountsPanel />
      <BalancesPanel />
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
                    {o.companyName ?? `Компания #${o.companyId}`} · {o.kind === "topup" ? "пополнение баланса" : `${PLANS[o.plan].name} на ${periodLabel(o.months)}`}
                    {o.automatic && <span className="billing-chip is-muted">автопродление</span>}
                    {o.method === "invoice" && <span className="billing-chip is-muted">по счёту</span>}
                    {o.method === "promo" && <span className="billing-chip is-muted">скидка на всю сумму</span>}
                    {o.method === "balance" && <span className="billing-chip is-muted">баллами</span>}
                    {o.promotionDiscountRub > 0 && <span className="billing-chip is-muted">акция −{formatRub(o.promotionDiscountRub)}</span>}
                    {o.promoCode && o.discountRub > 0 && (
                      <span className="billing-chip is-muted">
                        {o.discountSource === "lifetime" ? "постоянная " : ""}
                        {o.promoCode} −{formatRub(o.discountRub)}
                      </span>
                    )}
                    {o.pointsRub > 0 && o.method !== "balance" && <span className="billing-chip is-muted">баллами {formatRub(o.pointsRub)}</span>}
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
                    {o.method === "invoice" && o.status === "pending" && o.invoiceDueAt ? ` · оплатить до ${shortDate(o.invoiceDueAt)}` : ""}
                  </p>
                  {(o.hasInvoice || o.hasUpd) && (
                    <p className="billing-order-docs">
                      {o.hasInvoice && (
                        <a className="billing-doc-link" href={invoicePdfUrl(o.id)} download>
                          <Download aria-hidden /> Счёт
                        </a>
                      )}
                      {o.hasUpd && (
                        <a className="billing-doc-link" href={updPdfUrl(o.id)} download>
                          <Download aria-hidden /> УПД
                        </a>
                      )}
                    </p>
                  )}
                  {o.method === "invoice" ? <InvoiceActions order={o} /> : o.method === "card" || o.method === "balance" ? <OrderActions order={o} /> : null}
                </div>
                <div className="billing-order-side">
                  <b>{o.method === "balance" ? `${formatRub(o.pointsRub)} баллами` : formatRub(o.amountRub)}</b>
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
    { ok: diag.dadata, label: "Реквизиты по ИНН", hint: "DADATA_API_KEY — кнопка «Заполнить по ИНН» у реквизитов", optional: true },
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

      <div className={`root-cashbox-docs ${diag.documents.ready ? "is-ok" : "is-missing"}`}>
        {diag.documents.ready ? <Check aria-hidden /> : <X aria-hidden />}
        <div className="min-w-0">
          <p>
            <b>Счета и УПД</b> · {diag.documents.ready ? "реквизиты исполнителя заполнены: счёт для юрлиц открыт, УПД выпускаются" : "не хватает реквизитов исполнителя — счёт и УПД выключены"}
          </p>
          {!diag.documents.ready && (
            <ul>
              {diag.documents.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

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

  const points = order.method === "balance";
  const canRefund = order.status === "paid" && !order.isTest && (order.refundStatus === null || order.refundStatus === "canceled" || retry);
  // Оплату баллами касса не видела — сверять нечего.
  const canCheck = order.status !== "refunded" && !points;
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
          <Undo2 /> {retry ? "Повторить возврат" : points ? "Отменить оплату" : "Вернуть деньги"}
        </Button>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={
          retry ? `Повторить возврат ${formatRub(order.amountRub)}?` : points ? `Отменить оплату баллами (${formatRub(order.pointsRub)})?` : `Вернуть ${formatRub(order.amountRub)}?`
        }
        description={
          points ? (
            <p>
              Заказ №{order.id}, «{order.companyName ?? `компания #${order.companyId}`}». Баллы вернутся на баланс, срок тарифа — к тому, что был до оплаты (если после неё его не меняли).
            </p>
          ) : retry ? (
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
              {order.kind === "topup" ? (
                <p>Сначала с баланса компании спишутся {formatRub(order.amountRub)} баллов; если часть уже потрачена — возврат не отправим.</p>
              ) : (
                <p>
                  Если это последняя оплата компании, тариф и срок вернутся к тем, что были до неё. Автопродление этой серии выключится.
                  {order.pointsRub > 0 ? ` Баллы заказа (${formatRub(order.pointsRub)}) вернутся на баланс.` : ""}
                </p>
              )}
            </>
          )
        }
        confirmLabel={retry ? "Повторить возврат" : points ? "Отменить оплату" : "Вернуть деньги"}
        confirmWord={retry ? "ВЕРНУТЬ" : undefined}
        destructive
        busy={refund.isPending}
        error={refundError}
        onConfirm={() => refund.mutate()}
      />
    </div>
  );
}

/** Счёт: деньги пришли на расчётный счёт — root отмечает оплату; ненужный — отменяет. */
function InvoiceActions({ order }: { order: RootBillingOrder }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<"paid" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const action = useMutation({
    mutationFn: (kind: "paid" | "cancel") => rootPost<{ message: string }>(`/api/root/billing/orders/${order.id}/invoice-${kind}`, undefined, 30_000),
    onSuccess: async (data) => {
      setDialog(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: KEY }), queryClient.invalidateQueries({ queryKey: DIAG_KEY })]);
      toast({ title: `Счёт №${order.id}`, description: data.message });
    },
    onError: (err: Error) => setError(err.message),
  });
  const payable = order.status === "pending" || order.status === "expired" || order.status === "cancelled";
  if (!payable) return null;
  const open = (kind: "paid" | "cancel") => {
    setError(null);
    setDialog(kind);
  };
  return (
    <div className="root-order-actions">
      <Button type="button" variant="ghost" size="sm" onClick={() => open("paid")}>
        <CircleCheck /> Отметить оплату
      </Button>
      {order.status === "pending" && (
        <Button type="button" variant="ghost" size="sm" onClick={() => open("cancel")}>
          <Ban /> Отменить счёт
        </Button>
      )}
      <ConfirmDialog
        open={dialog !== null}
        onOpenChange={(next) => !next && setDialog(null)}
        title={dialog === "paid" ? `Отметить оплату ${formatRub(order.amountRub)}?` : `Отменить счёт №${order.id}?`}
        description={
          dialog === "paid" ? (
            <p>
              Отмечайте, только когда деньги по счёту №{order.id} пришли на расчётный счёт.{" "}
              {order.kind === "topup" ? `На баланс начислится ${formatRub(order.amountRub)} баллов` : `Тариф «${PLANS[order.plan].name}» продлится на ${periodLabel(order.months)}`}, админы «
              {order.companyName ?? `компании #${order.companyId}`}» получат уведомление, появится УПД.
            </p>
          ) : (
            <p>Счёт станет «Отменён». Если его всё же оплатят, оплату можно будет отметить и после отмены.</p>
          )
        }
        confirmLabel={dialog === "paid" ? "Деньги пришли" : "Отменить счёт"}
        destructive={dialog === "cancel"}
        busy={action.isPending}
        error={error}
        onConfirm={() => dialog && action.mutate(dialog)}
      />
    </div>
  );
}

// --- Промокоды -------------------------------------------------------------------------

type PromoDraft = {
  code: string;
  kind: PromoKind;
  value: string;
  endsAt: string;
  maxUses: string;
  newClientsOnly: boolean;
  companyId: string;
  note: string;
  lifetime: boolean;
  durationMonths: string;
};
const EMPTY_PROMO: PromoDraft = {
  code: "",
  kind: "percent",
  value: "",
  endsAt: "",
  maxUses: "",
  newClientsOnly: false,
  companyId: "",
  note: "",
  lifetime: false,
  durationMonths: "",
};

/** Конец дня по Москве для даты из <input type="date">. */
const endOfDay = (date: string) => Math.floor(new Date(`${date}T23:59:59+03:00`).getTime() / 1000);

/**
 * Промокоды: скидка в процентах или рублях на одну оплату. Код и размер
 * скидки после создания не меняются (на них могли сослаться в рассылке) —
 * можно выключить, продлить срок или поменять лимит.
 */
function PromoCodesPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery<RootPromoCode[]>({
    queryKey: PROMO_KEY,
    queryFn: async ({ signal }) => {
      const res = await fetchOrFriendlyError("/api/root/billing/promo-codes", { credentials: "include", signal: withTimeout(signal, 30_000) });
      const data = (await res.json().catch(() => null)) as { promos?: RootPromoCode[] } | null;
      if (!res.ok || !Array.isArray(data?.promos)) throw new Error("Не удалось загрузить промокоды");
      return data.promos;
    },
  });
  const [draft, setDraft] = useState<PromoDraft>(EMPTY_PROMO);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/root/billing/promo-codes", {
        code: draft.code,
        kind: draft.kind,
        value: Math.round(Number(draft.value)) || 0,
        endsAt: draft.endsAt ? endOfDay(draft.endsAt) : null,
        maxUses: draft.maxUses ? Math.round(Number(draft.maxUses)) : null,
        newClientsOnly: draft.newClientsOnly,
        companyId: draft.companyId ? Math.round(Number(draft.companyId)) : null,
        note: draft.note || undefined,
        lifetime: draft.lifetime,
        durationMonths: draft.lifetime && draft.durationMonths ? Math.round(Number(draft.durationMonths)) : null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROMO_KEY });
      toast({ title: "Промокод создан", description: draft.code.toUpperCase() });
      setDraft(EMPTY_PROMO);
      setFormOpen(false);
    },
    onError: (err: Error) => setFormError(err.message),
  });
  const toggle = useMutation({
    mutationFn: (p: RootPromoCode) => apiRequest("PATCH", `/api/root/billing/promo-codes/${p.id}`, { active: !p.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROMO_KEY }),
    onError: (err: Error) => toast({ title: "Не сохранилось", description: err.message, variant: "destructive" }),
  });
  const copyLink = async (code: string) => {
    const link = `${window.location.origin}/admin/billing?promo=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Ссылка скопирована", description: link });
    } catch {
      toast({ title: "Не скопировалось", description: link, variant: "destructive" });
    }
  };
  const set = <K extends keyof PromoDraft>(key: K, value: PromoDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFormError(null);
  };
  const now = Math.floor(Date.now() / 1000);

  return (
    <section className="content-panel" aria-labelledby="root-promo-title">
      <div className="section-title">
        <Ticket className="w-5 h-5 text-primary" />
        <h2 id="root-promo-title">Промокоды</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Обычный код — скидка на одну оплату картой или по счёту, автопродление дальше идёт по полной цене. «Постоянная скидка» после оплаты закрепляется за
        компанией и действует на все следующие оплаты и автопродление (до {LIFETIME_MAX_PERCENT} %). Промокод на 100 % включает тариф без оплаты.
      </p>
      {query.isLoading ? (
        <ListSkeleton rows={2} />
      ) : query.isError || !query.data ? (
        <QueryError onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">Промокодов пока нет.</p>
      ) : (
        <ul className="billing-orders root-promos">
          {query.data.map((p) => {
            const expired = p.endsAt !== null && p.endsAt < now;
            const exhausted = p.maxUses !== null && p.paidUses >= p.maxUses;
            const state = !p.active ? "выключен" : expired ? "истёк" : exhausted ? "исчерпан" : "действует";
            return (
              <li key={p.id} className="billing-order">
                <div className="min-w-0">
                  <p className="billing-order-title">
                    <code className="root-promo-code">{p.code}</code> {promoLabel(p.kind, p.value)}
                    <span className={`billing-chip ${state === "действует" ? "is-ok" : "is-muted"}`}>{state}</span>
                    {p.lifetime && <span className="billing-chip is-muted">постоянная{p.durationMonths ? ` · ${periodLabel(p.durationMonths)}` : ""}</span>}
                  </p>
                  <p className="billing-order-meta">
                    оплат: {p.paidUses}
                    {p.maxUses !== null ? ` из ${p.maxUses}` : ""}
                    {p.endsAt ? ` · до ${shortDate(p.endsAt)}` : " · без срока"}
                    {p.newClientsOnly ? " · только первая оплата" : ""}
                    {p.companyId ? ` · только «${p.companyName ?? `#${p.companyId}`}»` : ""}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                  <div className="root-order-actions">
                    <Button type="button" variant="ghost" size="sm" onClick={() => void copyLink(p.code)}>
                      <Copy /> Ссылка
                    </Button>
                    <Button type="button" variant="ghost" size="sm" loading={toggle.isPending && toggle.variables?.id === p.id} loadingLabel="…" onClick={() => toggle.mutate(p)}>
                      {p.active ? <Ban /> : <Check />} {p.active ? "Выключить" : "Включить"}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {formOpen ? (
        <form
          className="root-promo-form"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="billing-field">
            <span>Код</span>
            <input className="root-price-input" value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="START" autoCapitalize="characters" maxLength={32} required />
          </label>
          <label className="billing-field">
            <span>Скидка</span>
            <span className="root-promo-value">
              <input className="root-price-input" type="number" min={1} step={1} inputMode="numeric" value={draft.value} onChange={(e) => set("value", e.target.value)} required aria-label="Размер скидки" />
              <select className="reports-select" aria-label="Вид скидки" value={draft.kind} onChange={(e) => set("kind", e.target.value as PromoKind)}>
                <option value="percent">%</option>
                <option value="fixed">₽</option>
              </select>
            </span>
          </label>
          <label className="billing-field">
            <span>Действует до</span>
            <input className="root-price-input" type="date" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
          </label>
          <label className="billing-field">
            <span>Лимит оплат</span>
            <input className="root-price-input" type="number" min={1} step={1} inputMode="numeric" value={draft.maxUses} onChange={(e) => set("maxUses", e.target.value)} placeholder="без лимита" />
          </label>
          <label className="billing-field">
            <span>Только компании №</span>
            <input className="root-price-input" type="number" min={1} step={1} inputMode="numeric" value={draft.companyId} onChange={(e) => set("companyId", e.target.value)} placeholder="любой" />
          </label>
          <label className="billing-field root-promo-note">
            <span>Заметка</span>
            <input className="root-price-input" value={draft.note} onChange={(e) => set("note", e.target.value)} placeholder="рассылка, партнёр…" maxLength={255} />
          </label>
          <label className="billing-consent root-promo-check">
            <input type="checkbox" checked={draft.newClientsOnly} onChange={(e) => set("newClientsOnly", e.target.checked)} />
            <span>Только для первой оплаты компании</span>
          </label>
          <label className="billing-consent root-promo-check">
            <input type="checkbox" checked={draft.lifetime} onChange={(e) => set("lifetime", e.target.checked)} />
            <span>
              Постоянная скидка
              <small>После первой оплаты с кодом скидка закрепится за компанией и будет применяться сама — к оплатам и автопродлению.</small>
            </span>
          </label>
          {draft.lifetime && (
            <label className="billing-field">
              <span>Сколько месяцев действует</span>
              <input
                className="root-price-input"
                type="number"
                min={1}
                max={120}
                step={1}
                inputMode="numeric"
                value={draft.durationMonths}
                onChange={(e) => set("durationMonths", e.target.value)}
                placeholder="без срока"
              />
            </label>
          )}
          {formError && (
            <p className="billing-error root-promo-wide" role="alert">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2 root-promo-wide">
            <Button type="submit" size="sm" loading={create.isPending} loadingLabel="Создаём…">
              Создать промокод
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setFormOpen(true)}>
          <Plus /> Новый промокод
        </Button>
      )}
    </section>
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
