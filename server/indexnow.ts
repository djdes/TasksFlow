/**
 * IndexNow — сообщаем Яндексу и Bing об изменившихся страницах, не дожидаясь
 * обхода (https://www.indexnow.org/documentation).
 *
 * Ключ не секрет: поисковик проверяет владение сайтом, скачивая его с
 * адреса `/<ключ>.txt`. Этот файл отдаёт сервер (`server/public-assets.ts`),
 * а адреса после выкладки отправляет `script/submit-indexnow.mjs`.
 * В скрипте тот же ключ — совпадение сторожит `tests/indexnow.test.ts`.
 */
export const DEFAULT_INDEXNOW_KEY = "eb3dd8a9637e090ab73742c4803963fa";

/** По протоколу ключ — 8–128 символов: латиница, цифры и дефис. */
const KEY_RE = /^[A-Za-z0-9-]{8,128}$/;

export function indexNowKey(): string {
  const fromEnv = (process.env.INDEXNOW_KEY || "").trim();
  return KEY_RE.test(fromEnv) ? fromEnv : DEFAULT_INDEXNOW_KEY;
}
