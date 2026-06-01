/**
 * Валидация email для авторегистрации (лендинг).
 *
 * Цель — не дать ввести мусор/опечатки вроде «gmail.ru» (Хозяин просил
 * строго). Три уровня:
 *   1. normalizeEmail — trim + lowercase.
 *   2. isEmailFormat  — базовый формат a@b.cc.
 *   3. suggestDomainFix — подсказка опечатки домена (gmail.ru → gmail.com).
 *   4. checkMx — DNS MX-проверка, что домен реально принимает почту.
 *
 * suggestDomainFix используется и на клиенте (подсказка), и на сервере
 * (мягкий блок). checkMx — только сервер.
 */
import { promises as dnsPromises } from "dns";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email);
}

// Легитимные популярные домены (RU + мир). Используются для подсказки
// опечаток по расстоянию Левенштейна = 1.
const POPULAR_DOMAINS = [
  "gmail.com",
  "yandex.ru",
  "ya.ru",
  "mail.ru",
  "bk.ru",
  "list.ru",
  "inbox.ru",
  "internet.ru",
  "rambler.ru",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
];

// Явные частые опечатки → корректный домен. Дополняет Левенштейна
// (ловит случаи с дистанцией >1, напр. yandex.com → yandex.ru).
const TYPO_MAP: Record<string, string> = {
  "gmail.ru": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.ocm": "gmail.com",
  "yandex.com": "yandex.ru",
  "yandex.ua": "yandex.ru",
  "yndex.ru": "yandex.ru",
  "yadex.ru": "yandex.ru",
  "yanex.ru": "yandex.ru",
  "mai.ru": "mail.ru",
  "mial.ru": "mail.ru",
  "maill.ru": "mail.ru",
  "mail.ri": "mail.ru",
  "mail.com": "mail.ru",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "iclod.com": "icloud.com",
  "icloud.ru": "icloud.com",
};

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 2; // нам важно только <=1
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Возвращает исправленный email, если домен похож на опечатку известного
 * провайдера, иначе null. Не трогает локальную часть.
 */
export function suggestDomainFix(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain) return null;
  if (TYPO_MAP[domain]) return `${local}@${TYPO_MAP[domain]}`;
  if (POPULAR_DOMAINS.includes(domain)) return null;
  for (const cand of POPULAR_DOMAINS) {
    if (levenshtein(domain, cand) <= 1) return `${local}@${cand}`;
  }
  return null;
}

type MxResolver = (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;

const mxCache = new Map<string, { ok: boolean; at: number }>();
const MX_TTL_MS = 10 * 60 * 1000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Проверяет, что у домена есть MX-записи (реально принимает почту).
 * Кэш на 10 минут, таймаут 3с, resolver инъектируется для тестов.
 * При ошибке/таймауте возвращает false (домен считаем неподтверждённым).
 */
export async function checkMx(
  domain: string,
  resolver: MxResolver = dnsPromises.resolveMx,
): Promise<boolean> {
  const key = domain.toLowerCase();
  const cached = mxCache.get(key);
  if (cached && Date.now() - cached.at < MX_TTL_MS) return cached.ok;
  let ok = false;
  try {
    const records = await withTimeout(resolver(key), 3000);
    ok = Array.isArray(records) && records.length > 0;
  } catch {
    ok = false;
  }
  mxCache.set(key, { ok, at: Date.now() });
  return ok;
}

export interface EmailCheckResult {
  ok: boolean;
  normalized: string;
  error?: string;
  suggestion?: string;
}

/**
 * Полная серверная проверка email для /api/auth/start.
 * Возвращает normalized + ошибку/подсказку, не бросает.
 */
export async function validateEmailForAuth(
  raw: string,
  resolver?: MxResolver,
): Promise<EmailCheckResult> {
  const normalized = normalizeEmail(raw || "");
  if (!isEmailFormat(normalized)) {
    return { ok: false, normalized, error: "Введите корректный email" };
  }
  const suggestion = suggestDomainFix(normalized) ?? undefined;
  if (suggestion) {
    return {
      ok: false,
      normalized,
      suggestion,
      error: `Возможно, вы имели в виду ${suggestion}?`,
    };
  }
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  const mxOk = await checkMx(domain, resolver);
  if (!mxOk) {
    return {
      ok: false,
      normalized,
      error: "Похоже, такой почтовый домен не существует. Проверьте адрес.",
    };
  }
  return { ok: true, normalized };
}
