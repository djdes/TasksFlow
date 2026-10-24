import type { ClosingDocumentRow, PaymentOrderRow } from "@shared/schema";
import { buildClosingDraft, formatRuDate, renderUpdPdf, type ClosingDraft, type DocumentLine } from "./documents";
import type { Party } from "./legal";
import { buyerOf, buyerParty, documentsReady, requisitesOf, sellerOf, siteOf } from "./parties";
import type { BillingDeps } from "./service";

/**
 * Закрывающие документы (УПД, статус 2). Снимок сторон и строк делается в
 * момент оплаты (после settle) и дальше не меняется; для старых оплат и
 * если реквизиты Исполнителя появились позже — при первом скачивании.
 * Покупатель без ИНН в снимке дополняется, когда компания заполнит
 * реквизиты. Возврат денег аннулирует документ.
 */
const nowOf = (deps: BillingDeps) => (deps.now ?? (() => Math.floor(Date.now() / 1000)))();

type SellerSnapshot = Party & { vatNote: string; site: string; supportEmail: string };

function toRow(order: PaymentOrderRow, draft: ClosingDraft, now: number): Omit<ClosingDocumentRow, "id"> {
  const seller: SellerSnapshot = { ...draft.seller, vatNote: draft.vatNote, site: draft.site, supportEmail: draft.supportEmail };
  return {
    orderId: order.id,
    companyId: order.companyId,
    number: draft.number,
    issuedAt: draft.issuedAt,
    seller: JSON.stringify(seller),
    buyer: JSON.stringify(draft.buyer),
    lines: JSON.stringify(draft.lines),
    totalRub: draft.totalRub,
    status: "issued",
    voidedAt: null,
    createdAt: now,
  };
}

export function draftFromRow(row: ClosingDocumentRow): ClosingDraft {
  const { vatNote, site, supportEmail, ...seller } = JSON.parse(row.seller) as SellerSnapshot;
  const date = formatRuDate(row.issuedAt);
  return {
    number: row.number,
    issuedAt: row.issuedAt,
    seller,
    buyer: JSON.parse(row.buyer) as Party,
    lines: JSON.parse(row.lines) as DocumentLine[],
    totalRub: row.totalRub,
    basis: `Договор-оферта (${site}/offer), заказ № ${row.number} от ${date}`,
    paymentDocument: `№ ${row.number} от ${date}`,
    vatNote,
    site,
    supportEmail,
    voided: row.status === "voided",
  };
}

/**
 * УПД заказа: существующий снимок или новый. null — документа нет: не
 * оплачен, тестовый, без денег, идёт возврат или реквизиты Исполнителя не
 * заполнены. Аннулированный (возврат) отдаётся с пометкой.
 */
export async function ensureClosingDocument(deps: BillingDeps, order: PaymentOrderRow): Promise<ClosingDocumentRow | null> {
  const existing = await deps.store.getClosingDocument(order.id);
  if (existing) {
    const buyer = JSON.parse(existing.buyer) as Party;
    if (!buyer.inn && existing.status === "issued") {
      const row = await deps.store.getRequisites(order.companyId);
      if (row) {
        const fresh = buyerParty(requisitesOf(row), buyer.name);
        await deps.store.setClosingBuyer(order.id, JSON.stringify(fresh));
        return { ...existing, buyer: JSON.stringify(fresh) };
      }
    }
    return existing;
  }
  if (order.status !== "paid" || order.isTest || order.amountRub <= 0 || !documentsReady(deps)) return null;
  // Деньги возвращаются — новый документ не выпускаем.
  if (order.refundStatus && order.refundStatus !== "canceled") return null;
  const draft = buildClosingDraft({ order, seller: sellerOf(deps), buyer: await buyerOf(deps, order.companyId), site: siteOf(deps) });
  return deps.store.insertClosingDocument(toRow(order, draft, nowOf(deps)));
}

/** Снимок сразу после оплаты: реквизиты сторон — на дату оплаты, а не скачивания. */
export async function issueClosingDocument(deps: BillingDeps, orderId: number): Promise<void> {
  const order = await deps.store.getOrder(orderId);
  if (order) await ensureClosingDocument(deps, order);
}

export function closingPdf(row: ClosingDocumentRow): Buffer {
  return renderUpdPdf(draftFromRow(row));
}
