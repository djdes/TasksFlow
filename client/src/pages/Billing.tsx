import { useEffect, useMemo, useRef, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CreditCard, Loader2, ReceiptText, RefreshCw, ShieldCheck } from "lucide-react";
import { PLAN_FEATURES, PLAN_IDS, PLANS, type PlanId } from "@shared/plans";
import {
  daysLabel,
  formatRub,
  isPaidPlan,
  monthlyRate,
  monthsFor,
  OFFER_PATH,
  ORDER_STATUS_LABEL,
  periodLabel,
  planAfterPayment,
  priceFor,
  RECURRING_CONSENT_TEXT,
  RECURRING_NOTICE_DAYS,
  RECURRING_OFFER_HREF,
  recurringTerms,
  type BillingInfo,
  type BillingMonths,
  type BillingOrder,
  type PaidPlanId,
} from "@shared/billing";
import { useAuth } from "@/contexts/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton, PageSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { BILLING_KEY, cancelRecurring, fetchBilling, fetchOrder, startCheckout, useRobokassaScript } from "@/lib/billing-api";
import { useInstallState } from "@/lib/pwa";
import { ApiError } from "@/lib/queryClient";

const DAY = 86400;
const SUPPORT_EMAIL = "support@tasksflow.ru";
const BUSINESS_MAIL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("TasksFlow Бизнес: подключение")}`;

// «24 ноября 2026» — без «г.», чтобы не было двух точек в конце фразы.
const longDate = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }).replace(/\s?г\.$/, "");
const shortDate = (sec: number) => new Date(sec * 1000).toLocaleDateString("ru-RU");
const nowSec = () => Math.floor(Date.now() / 1000);

type Mode = "checkout" | "success" | "fail";

/**
 * «Тариф и оплата» (только админ компании): текущий тариф, выбор тарифа и
 * срока, оплата через Робокассу, автопродление и история платежей.
 *
 * Те же адреса — SuccessURL и FailURL магазина: /billing/success и
 * /billing/fail показывают, чем кончилась оплата. В окне оплаты поверх
 * страницы Робокасса открывает их внутри своей рамки — тогда страница
 * сама выходит из рамки.
 *
 * В наших приложениях (iOS, Android) — только состояние тарифа: правила
 * App Store и Google Play не разрешают продавать подписку мимо их покупок.
 */
export default function Billing() {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const install = useInstallState();
  const inApp = !!install.shell;
  const mode: Mode = location.startsWith("/billing/success") ? "success" : location.startsWith("/billing/fail") ? "fail" : "checkout";
  const search = useMemo(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search), []);
  const returnId = useMemo(() => {
    const n = Number(search.get("InvId") ?? search.get("invId"));
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [search]);
  const framed = typeof window !== "undefined" && window.self !== window.top;

  useEffect(() => {
    if (mode === "checkout" || !framed) return;
    try {
      window.top!.location.href = window.location.href;
    } catch {
      // Рамка чужого сайта — останемся в ней, страница всё покажет и так.
    }
  }, [mode, framed]);

  const isAdmin = !!user?.isAdmin;
  const query = useQuery<BillingInfo>({
    queryKey: [BILLING_KEY],
    queryFn: ({ signal }) => fetchBilling(signal),
    enabled: isAdmin,
  });

  if (isLoading) return <PageSkeleton />;
  if (!user) return <Redirect to="/login" />;
  if (!isAdmin) return <Redirect to="/dashboard" />;

  const info = query.data;
  return (
    <div className="page-screen">
      <div className="page-container billing-page">
        <button type="button" onClick={() => setLocation("/dashboard")} className="page-back group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          К задачам
        </button>
        <div className="page-header">
          <div className="page-title-row">
            <div className="page-icon">
              <CreditCard className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="page-title">Тариф и оплата</h1>
              <p className="page-subtitle">
                {inApp ? "Тариф вашей компании и платежи." : "Тариф компании, оплата картой или СБП через Робокассу и автопродление."}
              </p>
            </div>
          </div>
        </div>

        <div className="page-sections">
          {mode !== "checkout" && <ReturnPanel mode={mode} invId={returnId} onRetry={() => setLocation("/admin/billing")} />}
          {query.isLoading ? (
            <section className="content-panel">
              <ListSkeleton rows={3} />
            </section>
          ) : query.isError || !info ? (
            <section className="content-panel">
              <QueryError onRetry={() => void query.refetch()} />
            </section>
          ) : (
            <>
              <CurrentPlan info={info} inApp={inApp} />
              {!inApp && <Checkout info={info} defaultRecurring={search.get("recurring") === "1"} />}
              <Orders orders={info.orders} inApp={inApp} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Текущий тариф ----------------------------------------------------------------

function CurrentPlan({ info, inApp }: { info: BillingInfo; inApp: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = PLANS[info.plan.id];
  const limit = plan.maxUsers;
  const left = info.plan.until ? Math.ceil((info.plan.until - info.now) / DAY) : null;
  const status = info.plan.id === "start" ? "Бесплатный" : info.plan.perpetual ? "Бессрочно" : info.plan.until ? `до ${longDate(info.plan.until)}` : "";
  const ending = left !== null && left <= 7 && !info.recurring.active;
  const { recurring } = info;

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelRecurring();
      await queryClient.invalidateQueries({ queryKey: [BILLING_KEY] });
      setConfirmOpen(false);
      toast({ title: "Автопродление отключено", description: info.plan.until ? `Тариф действует до ${longDate(info.plan.until)}.` : undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отключить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="content-panel" aria-labelledby="billing-current-title">
      <div className="billing-current">
        <div className="billing-current-main">
          <p className="billing-eyebrow">Ваш тариф</p>
          <h2 id="billing-current-title" className="billing-current-name">
            «{plan.name}»
          </h2>
          <p className={`billing-chip ${ending ? "is-warn" : info.plan.id === "start" ? "is-muted" : "is-ok"}`}>
            {status}
            {ending && left !== null ? ` · осталось ${daysLabel(Math.max(left, 0))}` : ""}
          </p>
        </div>
        <div className="billing-seats">
          <p className="billing-seats-label">
            Сотрудников: <b>{info.plan.usersCount}</b>
            {limit !== null ? ` из ${limit}` : " · без лимита"}
          </p>
          {limit !== null && (
            <div className="billing-meter" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={info.plan.usersCount} aria-label="Занято мест в тарифе">
              <span style={{ width: `${Math.min(100, (info.plan.usersCount / limit) * 100)}%` }} data-full={info.plan.usersCount >= limit || undefined} />
            </div>
          )}
        </div>
      </div>

      {(recurring.active || info.recurringAvailable) && (
        <div className="billing-recurring">
          <RefreshCw className="billing-recurring-icon" aria-hidden />
          <div className="billing-recurring-body">
            <p className="billing-recurring-title">
              Автопродление <span className={`billing-chip ${recurring.active ? "is-ok" : "is-muted"}`}>{recurring.active ? "включено" : "выключено"}</span>
            </p>
            <p className="billing-recurring-text">
              {recurring.active && recurring.nextChargeAt && recurring.amountRub && recurring.months
                ? `${longDate(recurring.nextChargeAt)} спишем ${formatRub(recurring.amountRub)} — тариф продлится на ${periodLabel(recurring.months)}. Предупредим за ${daysLabel(RECURRING_NOTICE_DAYS)}. Отключить можно в любой момент, оплаченный срок сохранится.`
                : inApp
                  ? "Тариф продлевается вручную."
                  : "Оплата разовая. Чтобы тариф продлевался сам, поставьте галочку автосписаний при оплате."}
            </p>
          </div>
          {recurring.active && (
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)}>
              Отключить автопродление
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Отключить автопродление?"
        description={
          info.plan.until
            ? `Списаний больше не будет. Тариф «${plan.name}» действует до ${longDate(info.plan.until)}, потом его можно оплатить вручную.`
            : "Списаний больше не будет."
        }
        confirmLabel="Отключить"
        busy={busy}
        error={error}
        onConfirm={() => void disable()}
      />
    </section>
  );
}

// --- Выбор тарифа и оплата ---------------------------------------------------------

function Checkout({ info, defaultRecurring }: { info: BillingInfo; defaultRecurring: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const purchasable = PLAN_IDS.filter((id): id is PaidPlanId => isPaidPlan(id) && monthsFor(info.prices, id).length > 0);
  const initialPlan: PaidPlanId | null =
    isPaidPlan(info.plan.id) && purchasable.includes(info.plan.id) ? info.plan.id : purchasable[0] ?? null;
  const [plan, setPlan] = useState<PaidPlanId | null>(initialPlan);
  const available = plan ? monthsFor(info.prices, plan) : [];
  const [months, setMonths] = useState<BillingMonths | null>(() => {
    if (!initialPlan) return null;
    const list = monthsFor(info.prices, initialPlan);
    const series = info.recurring.months as BillingMonths | null;
    return series && list.includes(series) ? series : list[0] ?? null;
  });
  const [email, setEmail] = useState(info.email ?? "");
  const [consent, setConsent] = useState(defaultRecurring && info.recurringAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watch, setWatch] = useState<number | null>(null);
  const [paid, setPaid] = useState<BillingOrder | null>(null);
  const scriptReady = useRobokassaScript(info.configured);

  // Выбранного срока у нового тарифа может не быть — берём ближайший.
  useEffect(() => {
    if (plan && months && !available.includes(months)) setMonths(available[0] ?? null);
  }, [plan, months, available]);

  // Пока человек платит в окне Робокассы, ждём подтверждения здесь: возврат
  // на SuccessURL происходит внутри окна, а эта страница о нём не узнает.
  useEffect(() => {
    if (!watch) return;
    let stopped = false;
    let timer: number | undefined;
    const started = Date.now();
    const tick = async () => {
      try {
        const order = await fetchOrder(watch);
        if (order?.status === "paid") {
          if (stopped) return;
          setPaid(order);
          setWatch(null);
          void queryClient.invalidateQueries({ queryKey: [BILLING_KEY] });
          return;
        }
      } catch {
        // сеть моргнула — спросим ещё раз
      }
      if (!stopped && Date.now() - started < 15 * 60_000) timer = window.setTimeout(tick, 3000);
    };
    timer = window.setTimeout(tick, 3000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [watch, queryClient]);

  const price = plan && months ? priceFor(info.prices, plan, months) : null;
  const preview = plan && months && price !== null
    ? planAfterPayment({ currentPlan: info.plan.id, currentUntil: info.plan.until, plan, months, now: nowSec(), prices: info.prices })
    : null;
  const remainingDays = info.plan.until && info.plan.id !== "start" ? Math.max(0, Math.ceil((info.plan.until - info.now) / DAY)) : 0;
  const seriesOther =
    info.recurring.active && plan && months && (info.recurring.plan !== plan || info.recurring.months !== months) && !consent;

  const pay = async () => {
    if (!plan || !months || price === null) return;
    setBusy(true);
    setError(null);
    try {
      const data = await startCheckout({ plan, months, recurringConsent: consent && info.recurringAvailable, email: email.trim() || undefined, expectedRub: price });
      if (scriptReady && window.Robokassa) {
        window.Robokassa.StartPayment(data.params);
        setWatch(data.invId);
        setBusy(false);
        return;
      }
      window.location.href = data.paymentUrl;
    } catch (err) {
      if (err instanceof ApiError && err.body?.code === "price_changed") {
        void queryClient.invalidateQueries({ queryKey: [BILLING_KEY] });
      }
      setError(err instanceof Error ? err.message : "Не удалось начать оплату");
      setBusy(false);
    }
  };

  useEffect(() => {
    if (paid) toast({ title: "Оплата получена", description: paid.planUntil ? `Тариф действует до ${longDate(paid.planUntil)}.` : undefined });
  }, [paid, toast]);

  if (info.plan.perpetual) {
    return (
      <section className="content-panel">
        <div className="section-title">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2>Оплата не нужна</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Тариф «{PLANS[info.plan.id].name}» подключён бессрочно. Сменить тариф поможет поддержка: <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
    );
  }

  return (
    <section className="content-panel" aria-labelledby="billing-checkout-title">
      <div className="section-title billing-checkout-head">
        <CreditCard className="w-5 h-5 text-primary" />
        <h2 id="billing-checkout-title">{info.plan.id === "start" ? "Подключить тариф" : "Продлить или сменить тариф"}</h2>
        {info.testMode && <span className="billing-chip is-warn">Тестовый режим — деньги не списываются</span>}
      </div>

      <div className="billing-plans" role="radiogroup" aria-label="Тариф">
        {PLAN_IDS.map((id) => {
          const rate = isPaidPlan(id) ? monthlyRate(info.prices, id) : 0;
          const selectable = isPaidPlan(id) && purchasable.includes(id);
          const selected = selectable && plan === id;
          const current = info.plan.id === id;
          const body = (
            <>
              <span className="billing-plan-top">
                <span className="billing-plan-name">{PLANS[id].name}</span>
                {current && <span className="billing-chip is-ok">сейчас</span>}
              </span>
              <span className="billing-plan-price">
                {id === "start" ? "0 ₽" : rate !== null ? formatRub(Math.round(rate)) : "по запросу"}
                {id !== "start" && rate !== null && <small> / мес</small>}
              </span>
              <ul className="billing-plan-features">
                {PLAN_FEATURES[id].map((f) => (
                  <li key={f}>
                    <Check aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              {id === "start" && <span className="billing-plan-note">Включается сам, когда платный срок закончится</span>}
            </>
          );
          if (selectable) {
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                className="billing-plan"
                onClick={() => setPlan(id)}
              >
                {body}
              </button>
            );
          }
          return (
            <div key={id} className="billing-plan" aria-disabled="true">
              {body}
              {id === "business" && (
                <a className="billing-plan-link" href={BUSINESS_MAIL}>
                  Обсудить подключение
                </a>
              )}
            </div>
          );
        })}
      </div>

      {plan && available.length > 0 && (
        <>
          <p className="billing-label" id="billing-period-label">
            Срок
          </p>
          <div className="billing-periods" role="radiogroup" aria-labelledby="billing-period-label">
            {available.map((m) => {
              const p = priceFor(info.prices, plan, m)!;
              return (
                <button key={m} type="button" role="radio" aria-checked={months === m} className="billing-period" onClick={() => setMonths(m)}>
                  <span>{periodLabel(m)}</span>
                  <small>{m === 1 ? formatRub(p) : `${formatRub(p)} · ${formatRub(Math.round(p / m))}/мес`}</small>
                </button>
              );
            })}
          </div>
        </>
      )}

      {plan && months && price !== null && preview && (
        <div className="billing-summary" aria-live="polite">
          <div className="billing-summary-row">
            <span>К оплате</span>
            <b className="billing-summary-sum">{formatRub(price)}</b>
          </div>
          <p className="billing-summary-text">
            Тариф «{PLANS[plan].name}» на {periodLabel(months)} — будет действовать до <b>{longDate(preview.until)}</b>.
            {preview.convertedFrom && remainingDays > 0
              ? ` Оставшиеся ${daysLabel(remainingDays)} «${PLANS[preview.convertedFrom].name}» пересчитаем по цене: это ${daysLabel(Math.round(preview.carriedSec / DAY))} «${PLANS[plan].name}».`
              : preview.carriedSec > 0
                ? " Срок прибавится к оставшемуся."
                : ""}
          </p>
          {seriesOther && info.recurringAvailable && (
            <p className="billing-summary-warn">
              <CircleAlert aria-hidden />
              Автопродление «{PLANS[info.recurring.plan ?? "team"].name}» выключится. Чтобы новый тариф продлевался сам, поставьте галочку ниже.
            </p>
          )}
        </div>
      )}

      {plan && months && price !== null && (
        <form
          className="billing-form"
          onSubmit={(e) => {
            e.preventDefault();
            void pay();
          }}
        >
          <label className="billing-field">
            <span>Почта для чека</span>
            <Input type="email" inputMode="email" autoComplete="email" placeholder="boss@company.ru" value={email} onChange={(e) => setEmail(e.target.value)} />
            <small>Робокасса пришлёт сюда чек. Можно оставить пустым — спросит на странице оплаты.</small>
          </label>

          {info.recurringAvailable && (
            // Требования Робокассы: галочка не стоит по умолчанию, рядом —
            // текст согласия, ссылка на оферту и периодичность списаний.
            <label className="billing-consent">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                {RECURRING_CONSENT_TEXT} (
                <a href={RECURRING_OFFER_HREF} target="_blank" rel="noopener">
                  раздел «Автопродление»
                </a>
                ).
                <small>{recurringTerms(price, months)}</small>
                <small className="billing-consent-hint">Без галочки — разовый платёж, автосписаний не будет.</small>
              </span>
            </label>
          )}

          {error && (
            <p className="billing-error" role="alert">
              {error}
            </p>
          )}

          {paid ? (
            <p className="billing-paid" role="status">
              <Check aria-hidden /> Оплата получена{paid.planUntil ? ` — тариф до ${longDate(paid.planUntil)}` : ""}.
            </p>
          ) : info.configured ? (
            <button type="submit" className="page-cta billing-pay" disabled={busy || !!watch}>
              {busy ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Открываем оплату…
                </>
              ) : (
                <>
                  Перейти к оплате · {formatRub(price)} <ArrowRight className="w-5 h-5" aria-hidden />
                </>
              )}
            </button>
          ) : (
            <p className="billing-notice">
              Онлайн-оплата скоро появится. Чтобы подключить тариф сейчас, напишите на <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — выставим счёт.
            </p>
          )}

          {watch && (
            <p className="billing-wait" role="status">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Ждём подтверждение оплаты — страница обновится сама.
            </p>
          )}

          <p className="billing-legal">
            <ShieldCheck aria-hidden />
            <span>
              Оплата проходит на стороне Робокассы: данные карты нам не передаются. Нажимая «Перейти к оплате», вы принимаете{" "}
              <a href={OFFER_PATH} target="_blank" rel="noopener">
                оферту
              </a>{" "}
              и{" "}
              <a href="/terms" target="_blank" rel="noopener">
                пользовательское соглашение
              </a>
              .
            </span>
          </p>
        </form>
      )}

      {!plan && (
        <p className="billing-notice">
          Онлайн-оплата тарифов пока не открыта. Напишите на <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — подключим.
        </p>
      )}
    </section>
  );
}

// --- Возврат с оплаты ----------------------------------------------------------------

function ReturnPanel({ mode, invId, onRetry }: { mode: Exclude<Mode, "checkout">; invId: number | null; onRetry: () => void }) {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<BillingOrder | null | undefined>(undefined);
  const [slow, setSlow] = useState(false);
  const tries = useRef(0);

  useEffect(() => {
    if (!invId) {
      setOrder(null);
      return;
    }
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      tries.current += 1;
      try {
        const next = await fetchOrder(invId);
        if (stopped) return;
        setOrder(next);
        if (!next || next.status === "paid") {
          if (next) void queryClient.invalidateQueries({ queryKey: [BILLING_KEY] });
          return;
        }
        // Отказ: заказ так и не оплачен — один раз проверили и хватит.
        if (mode === "fail") return;
      } catch {
        // попробуем ещё раз
      }
      if (tries.current >= 20) setSlow(true);
      if (!stopped && tries.current < 200) timer = window.setTimeout(tick, tries.current < 20 ? 2000 : 10_000);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [invId, mode, queryClient]);

  if (order?.status === "paid") {
    return (
      <section className="content-panel billing-return is-success" role="status">
        <Check className="billing-return-icon" aria-hidden />
        <div>
          <h2>Оплата получена</h2>
          <p>
            {order.description}, {formatRub(order.amountRub)}.{order.planUntil ? ` Тариф действует до ${longDate(order.planUntil)}.` : ""}
          </p>
        </div>
      </section>
    );
  }
  if (mode === "fail") {
    return (
      <section className="content-panel billing-return is-fail" role="alert">
        <CircleAlert className="billing-return-icon" aria-hidden />
        <div>
          <h2>Оплата не прошла</h2>
          <p>Деньги не списаны. Попробуйте ещё раз — можно выбрать другую карту или СБП.</p>
          <Button type="button" size="sm" className="mt-3" onClick={onRetry}>
            Попробовать ещё раз
          </Button>
        </div>
      </section>
    );
  }
  if (order === null) {
    return (
      <section className="content-panel billing-return is-wait" role="status">
        <CircleAlert className="billing-return-icon" aria-hidden />
        <div>
          <h2>Не нашли этот платёж</h2>
          <p>Если деньги списались, тариф включится сам в течение нескольких минут. Вопросы — {SUPPORT_EMAIL}.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="content-panel billing-return is-wait" role="status">
      <Loader2 className="billing-return-icon animate-spin" aria-hidden />
      <div>
        <h2>Проверяем оплату…</h2>
        <p>
          {slow
            ? "Банк ещё подтверждает платёж. Страницу можно закрыть: тариф включится сам, мы пришлём уведомление."
            : "Обычно это занимает несколько секунд."}
        </p>
      </div>
    </section>
  );
}

// --- История платежей --------------------------------------------------------------

function Orders({ orders, inApp }: { orders: BillingOrder[]; inApp: boolean }) {
  return (
    <section className="content-panel" aria-labelledby="billing-orders-title">
      <div className="section-title">
        <ReceiptText className="w-5 h-5 text-primary" />
        <h2 id="billing-orders-title">Платежи</h2>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Платежей пока не было.</p>
      ) : (
        <ul className="billing-orders">
          {orders.map((o) => (
            <li key={o.id} className="billing-order">
              <div className="min-w-0">
                <p className="billing-order-title">
                  {PLANS[o.plan].name} на {periodLabel(o.months)}
                  {o.automatic && <span className="billing-chip is-muted">автопродление</span>}
                  {o.isTest && <span className="billing-chip is-warn">тест</span>}
                  {o.status === "paid" && (o.refundStatus === "sending" || o.refundStatus === "pending" || o.refundStatus === "uncertain") && (
                    <span className="billing-chip is-muted">возврат в обработке</span>
                  )}
                </p>
                <p className="billing-order-meta">
                  №{o.id} · {shortDate(o.paidAt ?? o.createdAt)}
                  {o.status === "paid" && o.planUntil ? ` · тариф до ${shortDate(o.planUntil)}` : ""}
                </p>
              </div>
              <div className="billing-order-side">
                <b>{formatRub(o.amountRub)}</b>
                <span className={`billing-chip ${o.status === "paid" ? "is-ok" : o.status === "pending" ? "is-warn" : "is-muted"}`}>
                  {ORDER_STATUS_LABEL[o.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!inApp && <p className="billing-orders-hint">Кассовые чеки присылает Робокасса на почту, указанную при оплате.</p>}
    </section>
  );
}
