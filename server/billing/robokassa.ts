import { createHash } from "node:crypto";

/**
 * Протокол Робокассы: подписи, параметры формы оплаты, чек и повторное
 * списание. Без БД и Express — всё на входе, поэтому тестируется напрямую.
 *
 * Пароли не путать:
 *   • Пароль #1 — подпись запроса на оплату, возврата на SuccessURL и
 *     повторного списания;
 *   • Пароль #2 — проверка уведомления об оплате на ResultURL.
 * В тестовом режиме (ROBOKASSA_IS_TEST=1) у магазина свои тестовые пароли,
 * поэтому подпись проверяется по режиму конкретного заказа, а не по
 * текущему env: тестовые заказы, оставшиеся после запуска, не «сломаются».
 *
 * Документация: https://docs.robokassa.ru/ru/ (оплата, iframe, рекуррент).
 */

export const PAYMENT_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";
export const RECURRING_URL = "https://auth.robokassa.ru/Merchant/Recurring";

/** Алгоритмы подписи из кабинета магазина («Технические настройки»). */
export const HASH_ALGORITHMS = ["md5", "ripemd160", "sha1", "sha256", "sha384", "sha512"] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

export type RobokassaConfig = {
  login: string;
  password1: string;
  password2: string;
  testPassword1: string;
  testPassword2: string;
  /** Новые заказы — в тестовом режиме. */
  isTest: boolean;
  hash: HashAlgorithm;
  /** Магазину подключены рекуррентные платежи. */
  recurring: boolean;
  /** Передавать чек (фискализация «Робочеки» или своя касса). */
  receipt: boolean;
  /** Система налогообложения для чека; пусто — из настроек магазина. */
  sno: string | null;
  /** Ставка НДС позиции чека. */
  tax: string;
};

type Env = NodeJS.ProcessEnv;

const read = (env: Env, key: string) => (env[key] ?? "").trim();
const flag = (env: Env, key: string) => ["1", "true", "on", "yes"].includes(read(env, key).toLowerCase());

export function robokassaConfig(env: Env = process.env): RobokassaConfig {
  const hash = read(env, "ROBOKASSA_HASH").toLowerCase();
  return {
    login: read(env, "ROBOKASSA_MERCHANT_LOGIN"),
    password1: read(env, "ROBOKASSA_PASSWORD1"),
    password2: read(env, "ROBOKASSA_PASSWORD2"),
    testPassword1: read(env, "ROBOKASSA_TEST_PASSWORD1"),
    testPassword2: read(env, "ROBOKASSA_TEST_PASSWORD2"),
    isTest: flag(env, "ROBOKASSA_IS_TEST"),
    hash: (HASH_ALGORITHMS as readonly string[]).includes(hash) ? (hash as HashAlgorithm) : "md5",
    recurring: flag(env, "ROBOKASSA_RECURRING"),
    receipt: flag(env, "ROBOKASSA_SEND_RECEIPT"),
    sno: read(env, "ROBOKASSA_RECEIPT_SNO") || null,
    tax: read(env, "ROBOKASSA_RECEIPT_TAX") || "none",
  };
}

function password1(cfg: RobokassaConfig, isTest: boolean): string {
  return isTest ? cfg.testPassword1 : cfg.password1;
}

function password2(cfg: RobokassaConfig, isTest: boolean): string {
  return isTest ? cfg.testPassword2 : cfg.password2;
}

/** Можно принимать оплату: есть логин и оба пароля текущего режима. */
export function isConfigured(cfg: RobokassaConfig): boolean {
  return Boolean(cfg.login && password1(cfg, cfg.isTest) && password2(cfg, cfg.isTest));
}

function digest(cfg: RobokassaConfig, value: string): string {
  return createHash(cfg.hash).update(value, "utf8").digest("hex");
}

function sameSignature(expected: string, received: string): boolean {
  return expected.toLowerCase() === received.trim().toLowerCase();
}

/**
 * Сумма для подписи и формы. Робокасса сверяет строку байт в байт,
 * поэтому формат строго «990.00».
 */
export function formatOutSum(amount: number | string): string {
  return Number(amount).toFixed(2);
}

/**
 * Пользовательские параметры Shp_* входят в подпись в конце, по алфавиту:
 * «…:Shp_a=1:Shp_b=2». Мы их не отправляем, но если Робокасса вернёт —
 * подпись должна сойтись.
 */
function shpTail(params: Record<string, string>): string[] {
  return Object.keys(params)
    .filter((k) => /^shp_/i.test(k))
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `${k}=${params[k]}`);
}

export type Receipt = { raw: string; encoded: string };

/**
 * Чек для фискализации (54-ФЗ): одна услуга — доступ к тарифу. Робокасса
 * ждёт в параметре Receipt URL-кодированный JSON и считает подпись по этой
 * же строке (в её примере формы value — уже закодированная строка), поэтому
 * и в подпись, и в параметр идёт `encoded`. Форма и URLSearchParams
 * кодируют его ещё раз при отправке — касса снимает этот слой сама.
 */
export function buildReceipt(cfg: RobokassaConfig, item: { name: string; sumRub: number }): Receipt {
  const name = item.name.replace(/['()!*~]/g, "").slice(0, 128);
  const receipt = {
    ...(cfg.sno ? { sno: cfg.sno } : {}),
    items: [
      { name, quantity: 1, sum: Number(formatOutSum(item.sumRub)), payment_method: "full_payment", payment_object: "service", tax: cfg.tax },
    ],
  };
  const raw = JSON.stringify(receipt);
  return { raw, encoded: encodeURIComponent(raw) };
}

/**
 * Параметры оплаты. Подпись: `login:OutSum:InvId[:Receipt]:Пароль#1`.
 * Recurring, Email, Culture и Encoding в подпись не входят.
 */
export function buildPaymentParams(
  cfg: RobokassaConfig,
  order: { id: number; amountRub: number; description: string; email: string | null; isTest: boolean; recurring: boolean },
): Record<string, string> {
  const outSum = formatOutSum(order.amountRub);
  const invId = String(order.id);
  const receipt = cfg.receipt ? buildReceipt(cfg, { name: order.description, sumRub: order.amountRub }) : null;
  const base = [cfg.login, outSum, invId, ...(receipt ? [receipt.encoded] : []), password1(cfg, order.isTest)].join(":");
  const params: Record<string, string> = {
    MerchantLogin: cfg.login,
    OutSum: outSum,
    InvId: invId,
    Description: order.description.slice(0, 100),
    SignatureValue: digest(cfg, base),
    Culture: "ru",
    Encoding: "utf-8",
  };
  if (order.email) params.Email = order.email;
  if (receipt) params.Receipt = receipt.encoded;
  if (order.isTest) params.IsTest = "1";
  // Первый платёж серии: касса запомнит карту для автосписаний.
  if (order.recurring) params.Recurring = "true";
  return params;
}

/** Обычная страница оплаты — когда окно поверх страницы не загрузилось. */
export function buildPaymentUrl(params: Record<string, string>): string {
  return `${PAYMENT_URL}?${new URLSearchParams(params).toString()}`;
}

/**
 * Уведомление на ResultURL: `OutSum:InvId:Пароль#2[:Shp_…]`. Если касса
 * вернула и Receipt, принимаем и подпись с ним (`OutSum:InvId:Receipt:…`) —
 * как пришёл и в URL-кодировке. Все варианты требуют Пароля #2.
 */
export function verifyResultSignature(
  cfg: RobokassaConfig,
  args: { outSum: string; invId: string; signature: string; isTest: boolean; params?: Record<string, string> },
): boolean {
  const pass = password2(cfg, args.isTest);
  if (!pass || !args.signature) return false;
  const params = args.params ?? {};
  const tail = [pass, ...shpTail(params)];
  if (sameSignature(digest(cfg, [args.outSum, args.invId, ...tail].join(":")), args.signature)) return true;
  const receipt = params.Receipt ?? params.receipt;
  if (!receipt) return false;
  return [receipt, encodeURIComponent(receipt)].some((r) =>
    sameSignature(digest(cfg, [args.outSum, args.invId, r, ...tail].join(":")), args.signature),
  );
}

/** Возврат человека на SuccessURL: `OutSum:InvId:Пароль#1[:Shp_…]`. */
export function verifySuccessSignature(
  cfg: RobokassaConfig,
  args: { outSum: string; invId: string; signature: string; isTest: boolean; params?: Record<string, string> },
): boolean {
  const pass = password1(cfg, args.isTest);
  if (!pass || !args.signature) return false;
  const base = [args.outSum, args.invId, pass, ...shpTail(args.params ?? {})].join(":");
  return sameSignature(digest(cfg, base), args.signature);
}

export type ChargeResult = {
  /** Касса приняла запрос («OK…»). Сама оплата подтвердится на ResultURL. */
  accepted: boolean;
  /**
   * Касса ответила внятно (принято или отказ). false — таймаут, сеть или
   * 5xx: списание могло и пройти, отказом это считать нельзя.
   */
  definitive: boolean;
  response: string;
};

/**
 * Повторное списание по сохранённой карте (рекуррентный платёж).
 * Подпись — как у обычного платежа с новым InvoiceID; PreviousInvoiceID
 * (первый платёж серии) в неё не входит. Ответ «OK<InvoiceID>» значит
 * «запрос принят», а сама оплата подтверждается уведомлением на ResultURL.
 */
export async function chargeRecurring(
  cfg: RobokassaConfig,
  charge: { invId: number; previousInvId: number; amountRub: number; description: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ChargeResult> {
  const outSum = formatOutSum(charge.amountRub);
  const invId = String(charge.invId);
  const receipt = cfg.receipt ? buildReceipt(cfg, { name: charge.description, sumRub: charge.amountRub }) : null;
  const base = [cfg.login, outSum, invId, ...(receipt ? [receipt.encoded] : []), cfg.password1].join(":");
  const body = new URLSearchParams({
    MerchantLogin: cfg.login,
    InvoiceID: invId,
    PreviousInvoiceID: String(charge.previousInvId),
    Description: charge.description.slice(0, 100),
    SignatureValue: digest(cfg, base),
    OutSum: outSum,
    ...(receipt ? { Receipt: receipt.encoded } : {}),
  });
  let res: Response;
  let response: string;
  try {
    res = await fetchImpl(RECURRING_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    response = (await res.text()).trim().slice(0, 500);
  } catch (err) {
    return { accepted: false, definitive: false, response: err instanceof Error ? err.message : String(err) };
  }
  const accepted = res.ok && /^OK/i.test(response);
  return { accepted, definitive: accepted || res.status < 500, response };
}

/**
 * Запрос из нашего iOS-приложения (метка TasksFlowApp/ в User-Agent).
 * Правила App Store (3.1.1) не разрешают оплачивать подписку в
 * приложении мимо встроенных покупок — ни кнопкой, ни ссылкой.
 */
export function isAppUserAgent(ua: string | undefined | null): boolean {
  return /TasksFlowApp\//.test(ua ?? "");
}
