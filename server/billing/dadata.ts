import { isValidInn, type InnLookupResult } from "@shared/billing";
import { logger } from "../logger";

/**
 * Реквизиты по ИНН — подсказки DaData (findById/party). Ключ — env
 * DADATA_API_KEY; без него кнопки «Заполнить по ИНН» нет. Любая ошибка
 * сервиса — понятный текст: реквизиты всегда можно ввести вручную.
 */
export const DADATA_PARTY_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party";
const TIMEOUT_MS = 6000;

export const dadataApiKey = (env: NodeJS.ProcessEnv = process.env): string | null => (env.DADATA_API_KEY ?? "").trim() || null;

type PartyData = {
  type?: "LEGAL" | "INDIVIDUAL";
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  name?: { short_with_opf?: string | null; full_with_opf?: string | null } | null;
  fio?: { surname?: string | null; name?: string | null; patronymic?: string | null } | null;
  management?: { name?: string | null; post?: string | null } | null;
  address?: { value?: string | null; unrestricted_value?: string | null } | null;
  state?: { status?: string | null } | null;
};
type PartyResponse = { suggestions?: Array<{ value?: string; data?: PartyData }> };

const STATE_WARNING: Record<string, string> = {
  LIQUIDATED: "По данным ФНС организация ликвидирована — проверьте ИНН.",
  LIQUIDATING: "По данным ФНС организация ликвидируется.",
  BANKRUPT: "По данным ФНС организация признана банкротом.",
  REORGANIZING: "По данным ФНС организация реорганизуется.",
};

/** ООО "РОМАШКА" → ООО «РОМАШКА». */
const quotes = (s: string) => s.replace(/"([^"]*)"/g, "«$1»");
/** ГЕНЕРАЛЬНЫЙ ДИРЕКТОР → Генеральный директор. */
const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const clip = (s: string | null | undefined, max: number) => {
  const v = (s ?? "").trim();
  return v ? v.slice(0, max) : null;
};

export function mapParty(inn: string, item: { value?: string; data?: PartyData }): InnLookupResult {
  const d = item.data ?? {};
  const ip = d.type === "INDIVIDUAL" || inn.length === 12;
  const fio = [d.fio?.surname, d.fio?.name, d.fio?.patronymic].filter(Boolean).join(" ");
  const name = clip(quotes(d.name?.short_with_opf || item.value || d.name?.full_with_opf || ""), 255);
  const address = clip(d.address?.unrestricted_value || d.address?.value, 500);
  if (!name) return { ok: false, message: "По этому ИНН нет названия — заполните реквизиты вручную" };
  return {
    ok: true,
    requisites: {
      kind: ip ? "ip" : "org",
      name,
      inn: d.inn && /^\d+$/.test(d.inn) ? d.inn : inn,
      kpp: ip ? null : clip(d.kpp, 9),
      ogrn: clip(d.ogrn, 15),
      address: address ?? "",
      headPost: ip ? null : clip(sentence(d.management?.post ?? ""), 100),
      headName: clip(ip ? fio || null : d.management?.name, 150),
    },
    warning: STATE_WARNING[d.state?.status ?? ""] ?? null,
  };
}

export async function lookupInn(apiKey: string, rawInn: string, fetchImpl: typeof fetch = fetch): Promise<InnLookupResult> {
  const inn = rawInn.replace(/\s+/g, "");
  if (!isValidInn(inn)) return { ok: false, message: "Проверьте ИНН: 10 цифр у организации, 12 — у ИП" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(DADATA_PARTY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Token ${apiKey}` },
      // Головная организация, не филиал: КПП и адрес — для документов.
      body: JSON.stringify({ query: inn, count: 1, branch_type: "MAIN" }),
      signal: controller.signal,
    });
    if (res.status === 429) return { ok: false, message: "Сервис подсказок перегружен — попробуйте через минуту или заполните вручную" };
    if (!res.ok) {
      logger.warn({ status: res.status }, "[billing] DaData: ошибка ответа");
      return { ok: false, message: "Автозаполнение сейчас недоступно — заполните реквизиты вручную" };
    }
    const body = (await res.json()) as PartyResponse;
    const item = body.suggestions?.[0];
    if (!item) return { ok: false, message: "По этому ИНН ничего не нашли — проверьте его или заполните вручную" };
    return mapParty(inn, item);
  } catch (err) {
    logger.warn({ err: String(err) }, "[billing] DaData не ответила");
    return { ok: false, message: "Автозаполнение сейчас недоступно — заполните реквизиты вручную" };
  } finally {
    clearTimeout(timer);
  }
}
