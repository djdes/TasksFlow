import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Coins, Percent, Plus, Search, Ticket } from "lucide-react";
import {
  formatRub,
  PROMOTION_MAX_PERCENT,
  type BalanceEntry,
  type RootBalance,
  type RootLifetimeDiscount,
  type RootPromotion,
} from "@shared/billing";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton } from "@/components/PageSkeleton";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

/**
 * Root → «Компании»: акции по расписанию, постоянные скидки компаний и
 * балансы (баллы) с корректировкой. Рядом с RootBillingPanel.
 */
const PROMOTIONS_KEY = ["root-billing-promotions"];
const DISCOUNTS_KEY = ["root-billing-discounts"];
const BALANCES_KEY = ["root-billing-balances"];

const DAY = 86400;
const shortDate = (sec: number) => new Date(sec * 1000).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
/** Начало дня по Москве для даты из <input type="date">. */
const startOfDay = (date: string) => Math.floor(new Date(`${date}T00:00:00+03:00`).getTime() / 1000);
/** Дата по Москве для <input type="date">. */
const toDateInput = (sec: number) => new Date((sec + 3 * 3600) * 1000).toISOString().slice(0, 10);
const signedRub = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatRub(Math.abs(n))}`;

async function getJson<T>(url: string, signal: AbortSignal | undefined, pick: (data: unknown) => T | null, error: string): Promise<T> {
  const res = await fetchOrFriendlyError(url, { credentials: "include", signal: withTimeout(signal, 30_000) });
  const data = await res.json().catch(() => null);
  const value = res.ok ? pick(data) : null;
  if (value === null) throw new Error((data as { message?: string } | null)?.message ?? error);
  return value;
}

// --- Акции ---------------------------------------------------------------------------------

type PromotionDraft = { title: string; percent: string; startsAt: string; endsAt: string; note: string };

/**
 * Акции: скидка в процентах на все тарифы и сроки в окне дат (по Москве).
 * Действует самая большая; промокод и постоянная скидка — от цены с акцией.
 */
export function PromotionsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery<RootPromotion[]>({
    queryKey: PROMOTIONS_KEY,
    queryFn: ({ signal }) =>
      getJson("/api/root/billing/promotions", signal, (d) => ((d as { promotions?: RootPromotion[] })?.promotions ?? null), "Не удалось загрузить акции"),
  });
  const today = toDateInput(Math.floor(Date.now() / 1000));
  const empty: PromotionDraft = { title: "", percent: "", startsAt: today, endsAt: "", note: "" };
  const [draft, setDraft] = useState<PromotionDraft>(empty);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof PromotionDraft>(key: K, value: PromotionDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFormError(null);
  };
  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/root/billing/promotions", {
        title: draft.title,
        percent: Math.round(Number(draft.percent)) || 0,
        startsAt: draft.startsAt ? startOfDay(draft.startsAt) : 0,
        // Последний день акции — включительно: конец окна — начало следующего дня.
        endsAt: draft.endsAt ? startOfDay(draft.endsAt) + DAY : 0,
        note: draft.note || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROMOTIONS_KEY });
      toast({ title: "Акция создана", description: "Цены на сайте и в кабинете обновятся в течение минуты." });
      setDraft(empty);
      setFormOpen(false);
    },
    onError: (err: Error) => setFormError(err.message),
  });
  const toggle = useMutation({
    mutationFn: (p: RootPromotion) => apiRequest("PATCH", `/api/root/billing/promotions/${p.id}`, { active: !p.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROMOTIONS_KEY }),
    onError: (err: Error) => toast({ title: "Не сохранилось", description: err.message, variant: "destructive" }),
  });
  const now = Math.floor(Date.now() / 1000);

  return (
    <section className="content-panel" aria-labelledby="root-promotions-title">
      <div className="section-title">
        <Percent className="w-5 h-5 text-primary" />
        <h2 id="root-promotions-title">Акции</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Скидка на все тарифы и сроки в выбранные дни (по Москве) — на сайте и при оплате. Пересекаются — действует большая. Автопродление идёт по полной цене.
      </p>
      {query.isLoading ? (
        <ListSkeleton rows={2} />
      ) : query.isError || !query.data ? (
        <QueryError onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">Акций пока не было.</p>
      ) : (
        <ul className="billing-orders root-promos">
          {query.data.map((p) => {
            const state = !p.active ? "выключена" : now < p.startsAt ? "запланирована" : now >= p.endsAt ? "закончилась" : "идёт";
            return (
              <li key={p.id} className="billing-order">
                <div className="min-w-0">
                  <p className="billing-order-title">
                    {p.title} −{p.percent} %<span className={`billing-chip ${state === "идёт" ? "is-ok" : state === "запланирована" ? "is-warn" : "is-muted"}`}>{state}</span>
                  </p>
                  <p className="billing-order-meta">
                    {shortDate(p.startsAt)} — {shortDate(p.endsAt - 1)} · оплат: {p.paidOrders}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                  {now < p.endsAt && (
                    <div className="root-order-actions">
                      <Button type="button" variant="ghost" size="sm" loading={toggle.isPending && toggle.variables?.id === p.id} loadingLabel="…" onClick={() => toggle.mutate(p)}>
                        {p.active ? <Ban /> : <Check />} {p.active ? "Выключить" : "Включить"}
                      </Button>
                    </div>
                  )}
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
          <label className="billing-field root-promo-wide">
            <span>Название — его видят на сайте</span>
            <input className="root-price-input" value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Осенняя акция" maxLength={120} required />
          </label>
          <label className="billing-field">
            <span>Скидка, %</span>
            <input
              className="root-price-input"
              type="number"
              min={1}
              max={PROMOTION_MAX_PERCENT}
              step={1}
              inputMode="numeric"
              value={draft.percent}
              onChange={(e) => set("percent", e.target.value)}
              required
            />
          </label>
          <label className="billing-field">
            <span>С (включительно)</span>
            <input className="root-price-input" type="date" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} required />
          </label>
          <label className="billing-field">
            <span>По (включительно)</span>
            <input className="root-price-input" type="date" value={draft.endsAt} min={draft.startsAt} onChange={(e) => set("endsAt", e.target.value)} required />
          </label>
          <label className="billing-field root-promo-note">
            <span>Заметка</span>
            <input className="root-price-input" value={draft.note} onChange={(e) => set("note", e.target.value)} placeholder="для себя" maxLength={255} />
          </label>
          {formError && (
            <p className="billing-error root-promo-wide" role="alert">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2 root-promo-wide">
            <Button type="submit" size="sm" loading={create.isPending} loadingLabel="Создаём…">
              Создать акцию
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              Отмена
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setFormOpen(true)}>
          <Plus /> Новая акция
        </Button>
      )}
    </section>
  );
}

// --- Постоянные скидки --------------------------------------------------------------------

/** Постоянные скидки компаний: появились после оплаты с «постоянным» кодом. */
export function LifetimeDiscountsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery<RootLifetimeDiscount[]>({
    queryKey: DISCOUNTS_KEY,
    queryFn: ({ signal }) =>
      getJson("/api/root/billing/discounts", signal, (d) => ((d as { discounts?: RootLifetimeDiscount[] })?.discounts ?? null), "Не удалось загрузить постоянные скидки"),
  });
  const [target, setTarget] = useState<RootLifetimeDiscount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revoke = useMutation({
    mutationFn: (d: RootLifetimeDiscount) => apiRequest("POST", `/api/root/billing/discounts/${d.id}/revoke`),
    onSuccess: async () => {
      setTarget(null);
      await queryClient.invalidateQueries({ queryKey: DISCOUNTS_KEY });
      toast({ title: "Скидка снята", description: "Админы компании получили уведомление." });
    },
    onError: (err: Error) => setError(err.message),
  });
  const now = Math.floor(Date.now() / 1000);

  return (
    <section className="content-panel" aria-labelledby="root-discounts-title">
      <div className="section-title">
        <Ticket className="w-5 h-5 text-primary" />
        <h2 id="root-discounts-title">Постоянные скидки</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Появляются после оплаты с промокодом «постоянная скидка» и применяются сами — к оплатам и автопродлению. Возврат той оплаты снимает скидку.
      </p>
      {query.isLoading ? (
        <ListSkeleton rows={2} />
      ) : query.isError || !query.data ? (
        <QueryError onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">Постоянных скидок пока нет.</p>
      ) : (
        <ul className="billing-orders root-promos">
          {query.data.map((d) => {
            const state = d.revokedAt !== null ? "снята" : d.expiresAt !== null && d.expiresAt <= now ? "истекла" : "действует";
            return (
              <li key={d.id} className="billing-order">
                <div className="min-w-0">
                  <p className="billing-order-title">
                    {d.companyName ?? `Компания #${d.companyId}`} · {d.label}
                    <span className={`billing-chip ${state === "действует" ? "is-ok" : "is-muted"}`}>{state}</span>
                  </p>
                  <p className="billing-order-meta">
                    код {d.code} · с {shortDate(d.boundAt)}
                    {d.expiresAt ? ` · до ${shortDate(d.expiresAt)}` : " · без срока"}
                    {d.orderId ? ` · заказ №${d.orderId}` : ""}
                  </p>
                  {state === "действует" && (
                    <div className="root-order-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setError(null);
                          setTarget(d);
                        }}
                      >
                        <Ban /> Снять
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Снять скидку ${target?.label ?? ""}?`}
        description={<p>«{target?.companyName ?? `Компания #${target?.companyId}`}» больше не получит скидку по коду {target?.code} — ни в оплатах, ни в автопродлении. Админы получат уведомление.</p>}
        confirmLabel="Снять скидку"
        destructive
        busy={revoke.isPending}
        error={error}
        onConfirm={() => target && revoke.mutate(target)}
      />
    </section>
  );
}

// --- Балансы --------------------------------------------------------------------------------

type CompanyBalance = { companyId: number; companyName: string; balanceRub: number; heldRub: number; history: BalanceEntry[] };

/** Балансы компаний: у кого есть баллы, история и корректировка (начислить или списать). */
export function BalancesPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const list = useQuery<RootBalance[]>({
    queryKey: BALANCES_KEY,
    queryFn: ({ signal }) => getJson("/api/root/billing/balances", signal, (d) => ((d as { balances?: RootBalance[] })?.balances ?? null), "Не удалось загрузить балансы"),
  });
  const [companyText, setCompanyText] = useState("");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const detail = useQuery<CompanyBalance>({
    queryKey: [...BALANCES_KEY, companyId],
    enabled: companyId !== null,
    queryFn: ({ signal }) => getJson(`/api/root/billing/balances/${companyId}`, signal, (d) => ((d as CompanyBalance)?.history ? (d as CompanyBalance) : null), "Компании с таким номером нет"),
  });
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const adjust = useMutation({
    mutationFn: () => apiRequest("POST", `/api/root/billing/balances/${companyId}/adjust`, { amountRub: Math.round(Number(amount)) || 0, reason }),
    onSuccess: async (res) => {
      const data = (await res.json()) as { message: string };
      await queryClient.invalidateQueries({ queryKey: BALANCES_KEY });
      toast({ title: "Баланс изменён", description: data.message });
      setAmount("");
      setReason("");
    },
    onError: (err: Error) => setAdjustError(err.message),
  });
  const open = (id: number) => {
    setCompanyId(id);
    setCompanyText(String(id));
    setAdjustError(null);
  };

  return (
    <section className="content-panel" aria-labelledby="root-balances-title">
      <div className="section-title">
        <Coins className="w-5 h-5 text-primary" />
        <h2 id="root-balances-title">Балансы компаний</h2>
      </div>
      <p className="text-sm text-muted-foreground">1 балл = 1 ₽. Корректировка видна компании в истории с причиной; в минус баланс не уходит.</p>

      {list.isLoading ? (
        <ListSkeleton rows={2} />
      ) : list.isError || !list.data ? (
        <QueryError onRetry={() => void list.refetch()} />
      ) : list.data.length > 0 ? (
        <ul className="billing-orders root-promos">
          {list.data.map((b) => (
            <li key={b.companyId} className="billing-order">
              <button type="button" className="root-balance-row" onClick={() => open(b.companyId)}>
                <span className="min-w-0">{b.companyName ?? `Компания #${b.companyId}`}</span>
                <b>{formatRub(b.balanceRub)}</b>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground mt-3">Баллов пока ни у кого нет.</p>
      )}

      <form
        className="root-balance-find"
        onSubmit={(e) => {
          e.preventDefault();
          const id = Math.round(Number(companyText));
          if (id > 0) open(id);
        }}
      >
        <label className="billing-field">
          <span>Компания №</span>
          <input className="root-price-input" type="number" min={1} step={1} inputMode="numeric" value={companyText} onChange={(e) => setCompanyText(e.target.value)} />
        </label>
        <Button type="submit" variant="outline" size="sm">
          <Search /> Открыть
        </Button>
      </form>

      {companyId !== null &&
        (detail.isLoading ? (
          <ListSkeleton rows={2} />
        ) : detail.isError || !detail.data ? (
          <QueryError onRetry={() => void detail.refetch()} />
        ) : (
          <div className="root-balance-detail">
            <p className="billing-order-title">
              {detail.data.companyName} · <b>{formatRub(detail.data.balanceRub)}</b> свободно
              {detail.data.heldRub > 0 ? ` · ещё ${formatRub(detail.data.heldRub)} заняты неоплаченным заказом (компания видит их в балансе)` : ""}
            </p>
            <form
              className="root-promo-form"
              onSubmit={(e) => {
                e.preventDefault();
                setAdjustError(null);
                adjust.mutate();
              }}
            >
              <label className="billing-field">
                <span>Сумма: + начислить, − списать</span>
                <input className="root-price-input" type="number" step={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500 или -500" required />
              </label>
              <label className="billing-field root-promo-note">
                <span>Причина — увидит компания</span>
                <input className="root-price-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="компенсация за простой" maxLength={200} required />
              </label>
              {adjustError && (
                <p className="billing-error root-promo-wide" role="alert">
                  {adjustError}
                </p>
              )}
              <div className="root-promo-wide">
                <Button type="submit" size="sm" loading={adjust.isPending} loadingLabel="Сохраняем…">
                  Изменить баланс
                </Button>
              </div>
            </form>
            {detail.data.history.length > 0 ? (
              <ul className="billing-ledger" aria-label="История баланса компании">
                {detail.data.history.map((e) => (
                  <li key={e.id} className="billing-ledger-row">
                    <div className="min-w-0">
                      <p className="billing-ledger-text">{e.description}</p>
                      <p className="billing-order-meta">
                        {shortDate(e.createdAt)} · остаток {formatRub(e.balanceAfter)}
                      </p>
                    </div>
                    <b className={e.amountRub > 0 ? "billing-ledger-plus" : "billing-ledger-minus"}>{signedRub(e.amountRub)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Операций не было.</p>
            )}
          </div>
        ))}
    </section>
  );
}
