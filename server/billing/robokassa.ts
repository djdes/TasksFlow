import { createHash, createHmac } from "node:crypto";

/**
 * Протокол Робокассы: подписи, параметры формы оплаты, чек и повторное
 * списание. Без БД и Express — всё на входе, поэтому тестируется напрямую.
 *
 * Пароли не путать:
 *   • Пароль #1 — подпись запроса на оплату, возврата на SuccessURL и
 *     повторного списания;
 *   • Пароль #2 — проверка уведомления об оплате на ResultURL и запрос
 *     состояния операции (OpStateExt);
 *   • Пароль #3 — API возвратов (JWT).
 * Форматы сверены с официальным плагином Робокассы для WordPress
 * (github.com/robokassa/cms-wordpress, RobokassaPayAPI.php, RefundApi.php).
 * В тестовом режиме (ROBOKASSA_IS_TEST=1) у магазина свои тестовые пароли,
 * поэтому подпись проверяется по режиму конкретного заказа, а не по
 * текущему env: тестовые заказы, оставшиеся после запуска, не «сломаются».
 *
 * Документация: https://docs.robokassa.ru/ru/ (оплата, iframe, рекуррент).
 */

export const PAYMENT_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";
export const RECURRING_URL = "https://auth.robokassa.ru/Merchant/Recurring";
export const OP_STATE_URL = "https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt";
export const REFUND_CREATE_URL = "https://services.robokassa.ru/RefundService/Refund/Create";
export const REFUND_STATE_URL = "https://services.robokassa.ru/RefundService/Refund/GetState";

/** Алгоритмы подписи из кабинета магазина («Технические настройки»). */
export const HASH_ALGORITHMS = ["md5", "ripemd160", "sha1", "sha256", "sha384", "sha512"] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];

export type RobokassaConfig = {
  login: string;
  password1: string;
  password2: string;
  testPassword1: string;
  testPassword2: string;
  /** Пароль #3 — только для API возвратов. */
  password3: string;
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
    password3: read(env, "ROBOKASSA_PASSWORD3"),
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
  charge: { invId: number; previousInvId: number; amountRub: number; description: string; isTest?: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<ChargeResult> {
  const outSum = formatOutSum(charge.amountRub);
  const invId = String(charge.invId);
  const isTest = charge.isTest === true;
  const receipt = cfg.receipt ? buildReceipt(cfg, { name: charge.description, sumRub: charge.amountRub }) : null;
  const base = [cfg.login, outSum, invId, ...(receipt ? [receipt.encoded] : []), password1(cfg, isTest)].join(":");
  const body = new URLSearchParams({
    MerchantLogin: cfg.login,
    InvoiceID: invId,
    PreviousInvoiceID: String(charge.previousInvId),
    Description: charge.description.slice(0, 100),
    SignatureValue: digest(cfg, base),
    OutSum: outSum,
    ...(receipt ? { Receipt: receipt.encoded } : {}),
    // Серия из тестового режима списывается тестово — так автопродление
    // можно проверить без денег (как в официальном плагине).
    ...(isTest ? { IsTest: "1" } : {}),
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

// --- Состояние операции (OpStateExt) ------------------------------------------

/** Коды Result в ответе OpStateExt. */
export const OP_RESULT = { ok: 0, badSignature: 1, shopNotFound: 2, notFound: 3, many: 4 } as const;

/**
 * Состояние операции (State/Code): 5 — создана, денег нет; 10 — отменена;
 * 50 — деньги получены, идёт зачисление; 60 — возвращены покупателю;
 * 80 — приостановлена; 100 — оплачена.
 */
export const OP_STATE = { created: 5, cancelled: 10, crediting: 50, refunded: 60, suspended: 80, paid: 100 } as const;

export type OpState =
  | { ok: true; resultCode: number; description: string; stateCode: number | null; opKey: string | null; incSum: string | null; paymentMethod: string | null }
  | { ok: false; error: string };

const xmlText = (xml: string, path: string[]): string | null => {
  // Без XML-парсера: ответ маленький и плоский, ищем вложенные теги по
  // локальному имени (пространство имён у Робокассы одно на весь ответ).
  let rest = xml;
  for (const tag of path) {
    const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(rest);
    if (!m) return null;
    rest = m[1];
  }
  return rest.trim();
};

export function parseOpState(xml: string): OpState {
  const code = xmlText(xml, ["Result", "Code"]);
  if (code === null || !/^\d+$/.test(code)) return { ok: false, error: "Робокасса вернула непонятный ответ" };
  const state = xmlText(xml, ["State", "Code"]);
  return {
    ok: true,
    resultCode: Number(code),
    description: xmlText(xml, ["Result", "Description"]) ?? "",
    stateCode: state && /^\d+$/.test(state) ? Number(state) : null,
    opKey: xmlText(xml, ["Info", "OpKey"]) || null,
    incSum: xmlText(xml, ["Info", "IncSum"]) || null,
    paymentMethod: xmlText(xml, ["Info", "PaymentMethod", "Description"]) || null,
  };
}

/**
 * Что касса знает об операции по номеру заказа. Подпись —
 * `MerchantLogin:InvoiceID:Пароль#2`. Нужна, чтобы засчитать оплату, если
 * уведомление на ResultURL потерялось, и чтобы проверить логин и Пароль #2.
 */
export async function opState(cfg: RobokassaConfig, invId: number, fetchImpl: typeof fetch = fetch): Promise<OpState> {
  if (!cfg.login || !cfg.password2) return { ok: false, error: "Не заданы логин магазина или Пароль #2" };
  const signature = digest(cfg, `${cfg.login}:${invId}:${cfg.password2}`).toUpperCase();
  const url = `${OP_STATE_URL}?${new URLSearchParams({ MerchantLogin: cfg.login, InvoiceID: String(invId), Signature: signature })}`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `Робокасса ответила ${res.status}` };
    return parseOpState(body);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// --- Возвраты (RefundService) ----------------------------------------------------

const base64Url = (value: string | Buffer) => Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Compact JWT HS256 на Пароле #3 — тело запроса RefundService. */
export function refundToken(payload: Record<string, unknown>, password3: string): string {
  const head = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const sign = base64Url(createHmac("sha256", password3).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sign}`;
}

export type RefundCreated =
  | { ok: true; requestId: string }
  /** definitive=false — ответа нет: возврат мог и уйти, повторять нельзя. */
  | { ok: false; definitive: boolean; error: string };

/**
 * Заявка на возврат. Без суммы — полный возврат (так требует документация
 * для полного), с суммой — частичный.
 */
export async function createRefund(
  cfg: RobokassaConfig,
  refund: { opKey: string; amountRub?: number | null },
  fetchImpl: typeof fetch = fetch,
): Promise<RefundCreated> {
  if (!cfg.password3) return { ok: false, definitive: true, error: "Не задан Пароль #3 (ROBOKASSA_PASSWORD3) — он нужен для возвратов" };
  const payload: Record<string, unknown> = { OpKey: refund.opKey };
  if (refund.amountRub) payload.RefundSum = refund.amountRub;
  let res: Response;
  let text: string;
  try {
    res = await fetchImpl(REFUND_CREATE_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      // По OpenAPI тело — JSON-строка с compact JWT.
      body: JSON.stringify(refundToken(payload, cfg.password3)),
      signal: AbortSignal.timeout(30_000),
    });
    text = await res.text();
  } catch (err) {
    return { ok: false, definitive: false, error: err instanceof Error ? err.message : String(err) };
  }
  let data: { success?: boolean; requestId?: string; message?: string | null } | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (res.ok && data?.success && data.requestId) return { ok: true, requestId: String(data.requestId) };
  const definitive = res.status >= 400 && res.status < 500 ? true : res.ok && !!data;
  return { ok: false, definitive, error: data?.message || `Робокасса отклонила возврат (HTTP ${res.status})` };
}

export type RefundState = { ok: true; label: string } | { ok: false; error: string };

/** Статус заявки на возврат: finished — деньги ушли, canceled — отменена. */
export async function refundState(requestId: string, fetchImpl: typeof fetch = fetch): Promise<RefundState> {
  try {
    const res = await fetchImpl(`${REFUND_STATE_URL}?${new URLSearchParams({ id: requestId })}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => null)) as { label?: string } | null;
    if (!res.ok || !data?.label) return { ok: false, error: `Нет статуса возврата (HTTP ${res.status})` };
    return { ok: true, label: String(data.label) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Запрос из нашего iOS-приложения (метка TasksFlowApp/ в User-Agent).
 * Правила App Store (3.1.1) не разрешают оплачивать подписку в
 * приложении мимо встроенных покупок — ни кнопкой, ни ссылкой.
 */
export function isAppUserAgent(ua: string | undefined | null): boolean {
  return /TasksFlowApp\//.test(ua ?? "");
}
