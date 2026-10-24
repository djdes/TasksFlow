import { isValidInn } from "@shared/billing";

/**
 * Реквизиты Исполнителя для счетов и УПД — только из env (GitHub Secrets →
 * .env сервера), как и реквизиты в оферте (LEGAL_OPERATOR_*). Пустое поле
 * не выдумываем: пока чего-то не хватает, счёт и УПД не выпускаются, а
 * root видит, чего именно («Касса» → «Счета и УПД»).
 */
export type Party = {
  name: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  address: string | null;
  head: { post: string; name: string } | null;
  bank?: { name: string; bik: string; account: string; corrAccount: string } | null;
};

export type SellerRequisites = Party & {
  bank: { name: string; bik: string; account: string; corrAccount: string };
  /**
   * Строка о НДС. Документы поддерживают только продавца без НДС (УСН, ИП):
   * УПД статус 2, графы налога «без НДС» — поэтому строка не настраивается.
   */
  vatNote: string;
  email: string | null;
};

type Env = NodeJS.ProcessEnv;
const read = (env: Env, key: string) => (env[key] ?? "").trim();

export function sellerRequisites(env: Env = process.env): SellerRequisites {
  const inn = read(env, "LEGAL_OPERATOR_INN");
  // У ИП (ИНН из 12 цифр) подписывает сам предприниматель.
  const post = read(env, "LEGAL_SIGNER_POST") || (inn.length === 12 ? "Индивидуальный предприниматель" : "");
  const signer = read(env, "LEGAL_SIGNER_NAME");
  return {
    name: read(env, "LEGAL_OPERATOR_NAME"),
    inn: inn || null,
    kpp: read(env, "LEGAL_OPERATOR_KPP") || null,
    ogrn: read(env, "LEGAL_OPERATOR_OGRN") || null,
    address: read(env, "LEGAL_OPERATOR_ADDRESS") || null,
    head: post || signer ? { post, name: signer } : null,
    bank: {
      name: read(env, "LEGAL_BANK_NAME"),
      bik: read(env, "LEGAL_BANK_BIK"),
      account: read(env, "LEGAL_BANK_ACCOUNT"),
      corrAccount: read(env, "LEGAL_BANK_CORR_ACCOUNT"),
    },
    vatNote: "НДС не облагается",
    email: read(env, "LEGAL_CONTACT_EMAIL") || null,
  };
}

const digits = (value: string | null | undefined, lengths: number[]) => !!value && /^\d+$/.test(value) && lengths.includes(value.length);

/** Чего не хватает для счёта и УПД — подписи для root, по имени секрета. */
export function sellerMissing(r: SellerRequisites): string[] {
  const missing: string[] = [];
  if (r.name.length < 3) missing.push("LEGAL_OPERATOR_NAME — наименование");
  if (!r.inn || !isValidInn(r.inn)) missing.push("LEGAL_OPERATOR_INN — ИНН");
  if (r.inn?.length === 10 && !digits(r.kpp, [9])) missing.push("LEGAL_OPERATOR_KPP — КПП организации");
  if (!digits(r.ogrn, [13, 15])) missing.push("LEGAL_OPERATOR_OGRN — ОГРН или ОГРНИП");
  if (!r.address || r.address.length < 10) missing.push("LEGAL_OPERATOR_ADDRESS — адрес");
  if (r.bank.name.length < 3) missing.push("LEGAL_BANK_NAME — банк");
  if (!digits(r.bank.bik, [9])) missing.push("LEGAL_BANK_BIK — БИК, 9 цифр");
  if (!digits(r.bank.account, [20])) missing.push("LEGAL_BANK_ACCOUNT — расчётный счёт, 20 цифр");
  if (!digits(r.bank.corrAccount, [20])) missing.push("LEGAL_BANK_CORR_ACCOUNT — корр. счёт, 20 цифр");
  if (!r.head?.post) missing.push("LEGAL_SIGNER_POST — должность подписанта");
  if (!r.head?.name) missing.push("LEGAL_SIGNER_NAME — ФИО подписанта");
  return missing;
}
