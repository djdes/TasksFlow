/**
 * Клиентская подсказка опечаток в домене email (gmail.ru → gmail.com).
 * Чистая, без DNS — серверная MX-проверка живёт в server/email-validate.ts.
 * Дублирует список доменов намеренно: этот модуль идёт в клиентский бандл,
 * а server/email-validate тянет node:dns и на клиент не годится.
 */
const POPULAR = [
  "gmail.com", "yandex.ru", "ya.ru", "mail.ru", "bk.ru", "list.ru",
  "inbox.ru", "internet.ru", "rambler.ru", "outlook.com", "hotmail.com",
  "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com",
];

const TYPO: Record<string, string> = {
  "gmail.ru": "gmail.com", "gmal.com": "gmail.com", "gmai.com": "gmail.com",
  "gmial.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com", "gmail.co": "gmail.com",
  "yandex.com": "yandex.ru", "yandex.ua": "yandex.ru", "yndex.ru": "yandex.ru",
  "mai.ru": "mail.ru", "mial.ru": "mail.ru", "maill.ru": "mail.ru", "mail.com": "mail.ru",
  "outlok.com": "outlook.com", "hotmial.com": "hotmail.com", "icloud.ru": "icloud.com",
};

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain) return null;
  if (TYPO[domain]) return `${local}@${TYPO[domain]}`;
  if (POPULAR.includes(domain)) return null;
  for (const c of POPULAR) if (lev(domain, c) <= 1) return `${local}@${c}`;
  return null;
}

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
