import type { CompanyRequisites } from "@shared/billing";
import type { CompanyRequisitesRow } from "@shared/schema";
import { sellerMissing, sellerRequisites, type Party, type SellerRequisites } from "./legal";
import type { BillingDeps } from "./service";

/**
 * Стороны документов: Исполнитель (env LEGAL_*, в тестах — deps.seller) и
 * покупатель (реквизиты компании из «Тариф и оплата»).
 */
export const sellerOf = (deps: Pick<BillingDeps, "seller">): SellerRequisites => (deps.seller ?? (() => sellerRequisites()))();

/** Счета и УПД выпускаются: реквизиты Исполнителя заполнены. */
export const documentsReady = (deps: Pick<BillingDeps, "seller">) => sellerMissing(sellerOf(deps)).length === 0;

export function requisitesOf(row: CompanyRequisitesRow): CompanyRequisites {
  return {
    kind: row.kind === "ip" ? "ip" : "org",
    name: row.name,
    inn: row.inn,
    kpp: row.kpp,
    ogrn: row.ogrn,
    address: row.address,
    headPost: row.headPost,
    headName: row.headName,
    email: row.email,
  };
}

export function buyerParty(requisites: CompanyRequisites | null, fallbackName: string): Party {
  if (!requisites) return { name: fallbackName, inn: null, kpp: null, ogrn: null, address: null, head: null };
  return {
    name: requisites.name,
    inn: requisites.inn,
    kpp: requisites.kpp,
    ogrn: requisites.ogrn,
    address: requisites.address,
    // ИП подписывает сам: должность — «Индивидуальный предприниматель».
    head: requisites.headName
      ? { post: requisites.headPost || (requisites.kind === "ip" ? "Индивидуальный предприниматель" : "Руководитель"), name: requisites.headName }
      : null,
  };
}

export async function buyerOf(deps: Pick<BillingDeps, "store" | "getCompany">, companyId: number): Promise<Party> {
  const [row, company] = await Promise.all([deps.store.getRequisites(companyId), deps.getCompany(companyId)]);
  return buyerParty(row ? requisitesOf(row) : null, company?.name ?? `Компания #${companyId}`);
}

/** «tasksflow.ru» — для оферты в документах. */
export const siteOf = (deps: Pick<BillingDeps, "baseUrl">) =>
  (deps.baseUrl?.() ?? "https://tasksflow.ru").replace(/^https?:\/\//, "").replace(/\/+$/, "");
