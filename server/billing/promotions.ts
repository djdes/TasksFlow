import {
  promoLabel,
  promotionCreateSchema,
  promotionPatchSchema,
  type RootLifetimeDiscount,
  type RootPromotion,
} from "@shared/billing";
import { logger } from "../logger";
import type { BillingDeps, Reply } from "./service";
import type { PromotionListRow } from "./store";

/**
 * Root: акции по расписанию и постоянные скидки компаний. Скидку и начало
 * акции после создания не меняем — их уже видели на сайте; можно продлить
 * или сократить срок, выключить и поправить заметку.
 */
const nowOf = (deps: BillingDeps) => (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

export function toRootPromotion(row: PromotionListRow): RootPromotion {
  return {
    id: row.id,
    title: row.title,
    percent: row.discountPercent,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
    note: row.note,
    createdAt: row.createdAt,
    paidOrders: row.paidOrders,
  };
}

export async function listRootPromotions(deps: BillingDeps): Promise<RootPromotion[]> {
  return (await deps.store.listPromotions()).map(toRootPromotion);
}

export async function createRootPromotion(deps: BillingDeps, body: unknown): Promise<Reply<{ promotion: RootPromotion }>> {
  const parsed = promotionCreateSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { message: parsed.error.errors[0]?.message ?? "Проверьте акцию" } };
  const data = parsed.data;
  const now = nowOf(deps);
  if (data.endsAt <= now) return { status: 400, json: { message: "Акция уже закончилась бы — проверьте дату конца" } };
  const row = await deps.store.createPromotion({
    title: data.title,
    discountPercent: data.percent,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    active: true,
    note: data.note || null,
    createdAt: now,
    updatedAt: now,
  });
  logger.info({ id: row.id, percent: data.percent, startsAt: data.startsAt, endsAt: data.endsAt }, "[billing] акция создана");
  return { status: 200, json: { promotion: toRootPromotion({ ...row, paidOrders: 0 }) } };
}

export async function updateRootPromotion(deps: BillingDeps, id: number, body: unknown): Promise<Reply<{ promotion: RootPromotion }>> {
  const parsed = promotionPatchSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { message: parsed.error.errors[0]?.message ?? "Проверьте данные" } };
  const current = await deps.store.getPromotion(id);
  if (!current) return { status: 404, json: { message: "Акция не найдена" } };
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as { active?: boolean; endsAt?: number; note?: string | null };
  if (patch.endsAt !== undefined && patch.endsAt <= current.startsAt) return { status: 400, json: { message: "Конец раньше начала" } };
  if (patch.note !== undefined) patch.note = patch.note || null;
  const row = await deps.store.updatePromotion(id, patch, nowOf(deps));
  if (!row) return { status: 404, json: { message: "Акция не найдена" } };
  logger.info({ id, patch }, "[billing] акция изменена");
  return { status: 200, json: { promotion: toRootPromotion({ ...row, paidOrders: current.paidOrders }) } };
}

// --- Постоянные скидки -------------------------------------------------------------------

export async function listRootDiscounts(deps: BillingDeps): Promise<RootLifetimeDiscount[]> {
  return (await deps.store.listCompanyDiscounts()).map((row) => {
    const kind = row.kind === "fixed" ? "fixed" : "percent";
    return {
      id: row.id,
      companyId: row.companyId,
      companyName: row.companyName,
      code: row.code,
      kind,
      value: row.value,
      label: promoLabel(kind, row.value),
      boundAt: row.boundAt,
      expiresAt: row.expiresAt,
      orderId: row.orderId,
      revokedAt: row.revokedAt,
    };
  });
}

export async function revokeRootDiscount(deps: BillingDeps, id: number, by: { userId: number }): Promise<Reply<{ message: string }>> {
  const row = await deps.store.revokeCompanyDiscount(id, nowOf(deps), by.userId);
  if (!row) return { status: 404, json: { message: "Такой действующей постоянной скидки нет" } };
  logger.info({ id, companyId: row.companyId, code: row.code, by: by.userId }, "[billing] постоянная скидка снята");
  deps.notify.live(row.companyId);
  const label = promoLabel(row.kind === "fixed" ? "fixed" : "percent", row.value);
  void deps.notify
    .admins(row.companyId, {
      title: "Постоянная скидка снята",
      body: `Скидка ${label} по коду ${row.code} больше не действует.`,
      paragraphs: [
        `Постоянная скидка ${label} по коду ${row.code} больше не применяется к оплатам и автопродлению.`,
        "Если это ошибка, напишите на support@tasksflow.ru.",
      ],
    })
    .catch((err) => logger.warn({ err, companyId: row.companyId }, "[billing] уведомление о снятии скидки не ушло"));
  return { status: 200, json: { message: `Скидка ${row.code} снята` } };
}
