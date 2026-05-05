/**
 * Защита от SSRF: валидация URL'ов которые сервер дёргает по сети.
 *
 * Используется в:
 *   - PUT /api/companies/me (wesetupBaseUrl)
 *   - и любой другой форме где админ вводит URL который мы потом
 *     вызовем через fetch.
 *
 * Без этой проверки админ мог бы:
 *   - Прочитать AWS-metadata через 169.254.169.254
 *   - Поломать локальные сервисы (Redis localhost:6379, и т.п.)
 *   - Получить ответ с локального admin-эндпоинта
 *
 * В dev можно отключить через LOCAL_INTEGRATIONS_ALLOWED=1.
 */

function isPrivateHostname(rawHostname: string): boolean {
  // По WHATWG URL spec, IPv6 hostname возвращается со square brackets:
  //   new URL("http://[::1]/").hostname === "[::1]"
  // Раньше сравнивали `=== "::1"` — не срабатывало, защита loopback IPv6
  // обходилась банальной заменой `localhost` → `[::1]`. Снимаем скобки.
  const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
    ? rawHostname.slice(1, -1).toLowerCase()
    : rawHostname.toLowerCase();

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  // 0.0.0.0 на Linux часто routes на localhost — блокируем.
  if (hostname === "0.0.0.0" || hostname === "::") return true;
  // RFC1918 private IPv4
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  // 127.x.x.x — весь loopback диапазон, не только 127.0.0.1
  if (/^127\./.test(hostname)) return true;
  // AWS / GCP / Azure metadata
  if (/^169\.254\./.test(hostname)) return true;
  // IPv6 unique-local (fc00::/7) — fc00..fdff
  if (/^f[cd][0-9a-f]{2}:/.test(hostname)) return true;
  // IPv6 link-local (fe80::/10) — fe80..febf
  if (/^fe[89ab][0-9a-f]:/.test(hostname)) return true;
  // IPv4-mapped IPv6: ::ffff:127.0.0.1 — формальная защита от обхода
  // через альтернативную форму записи loopback'а.
  if (hostname.startsWith("::ffff:")) {
    const v4 = hostname.slice(7);
    if (
      v4 === "127.0.0.1" || v4 === "0.0.0.0" ||
      /^127\./.test(v4) || /^10\./.test(v4) ||
      /^192\.168\./.test(v4) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(v4) ||
      /^169\.254\./.test(v4)
    ) return true;
  }
  // Single-label hostname без точки — кроме localhost (уже выше). Это
  // потенциально internal DNS name (myredis, myapi) с private route'ом.
  if (!hostname.includes(".") && !hostname.includes(":")) return true;
  return false;
}

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (process.env.LOCAL_INTEGRATIONS_ALLOWED !== "1") {
      if (isPrivateHostname(u.hostname)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
