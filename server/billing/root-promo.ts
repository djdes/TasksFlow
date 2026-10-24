import {
  isValidPromoCodeFormat,
  normalizePromoCode,
  promoCodeCreateSchema,
  promoCodePatchSchema,
  type PromoKind,
  type RootPromoCode,
} from "@shared/billing";
import { logger } from "../logger";
import type { BillingDeps, Reply } from "./service";
import type { PromoCodeListRow } from "./store";

/**
 * Root: промокоды. Код и размер скидки после создания не меняются — на
 * них уже могли сослаться в рассылке; менять можно срок, лимит, заметку и
 * включённость.
 */
const nowOf = (deps: BillingDeps) => (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

export function toRootPromo(row: PromoCodeListRow): RootPromoCode {
  return {
    id: row.id,
    code: row.code,
    kind: (row.kind === "fixed" ? "fixed" : "percent") as PromoKind,
    value: row.value,
    active: row.active,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxUses: row.maxUses,
    newClientsOnly: row.newClientsOnly,
    companyId: row.companyId,
    companyName: row.companyName,
    note: row.note,
    paidUses: row.paidUses,
    createdAt: row.createdAt,
  };
}

export async function listRootPromos(deps: BillingDeps): Promise<RootPromoCode[]> {
  return (await deps.store.listPromos()).map(toRootPromo);
}

export async function createRootPromo(deps: BillingDeps, body: unknown): Promise<Reply<{ promo: RootPromoCode }>> {
  const parsed = promoCodeCreateSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { message: parsed.error.errors[0]?.message ?? "Проверьте промокод" } };
  const data = parsed.data;
  const code = normalizePromoCode(data.code);
  if (!isValidPromoCodeFormat(code)) return { status: 400, json: { message: "Код: латиница, цифры, «-» и «_», от 3 до 32 символов" } };
  let companyName: string | null = null;
  if (data.companyId) {
    const company = await deps.getCompany(data.companyId);
    if (!company) return { status: 400, json: { message: "Компании с таким номером нет" } };
    companyName = company.name;
  }
  const now = nowOf(deps);
  const row = await deps.store.createPromo({
    code,
    kind: data.kind,
    value: data.value,
    active: true,
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
    maxUses: data.maxUses ?? null,
    newClientsOnly: data.newClientsOnly,
    companyId: data.companyId ?? null,
    note: data.note || null,
    createdAt: now,
    updatedAt: now,
  });
  if (!row) return { status: 409, json: { message: "Такой код уже есть" } };
  logger.info({ code, kind: data.kind, value: data.value }, "[billing] промокод создан");
  return { status: 200, json: { promo: toRootPromo({ ...row, paidUses: 0, companyName }) } };
}

export async function updateRootPromo(deps: BillingDeps, id: number, body: unknown): Promise<Reply<{ promo: RootPromoCode }>> {
  const parsed = promoCodePatchSchema.safeParse(body);
  if (!parsed.success) return { status: 400, json: { message: parsed.error.errors[0]?.message ?? "Проверьте данные" } };
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as typeof parsed.data;
  if (patch.note !== undefined) patch.note = patch.note || (null as unknown as string);
  const row = await deps.store.updatePromo(id, patch, nowOf(deps));
  if (!row) return { status: 404, json: { message: "Промокод не найден" } };
  const [paidUses, company] = await Promise.all([deps.store.promoPaidUses(row.code), row.companyId ? deps.getCompany(row.companyId) : Promise.resolve(undefined)]);
  logger.info({ code: row.code, patch }, "[billing] промокод изменён");
  return { status: 200, json: { promo: toRootPromo({ ...row, paidUses, companyName: company?.name ?? null }) } };
}
