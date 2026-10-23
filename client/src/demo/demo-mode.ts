/**
 * Демо-кабинет: флаг живёт в sessionStorage вкладки — закрыли вкладку,
 * демо кончилось. Без sessionStorage демо работает до перезагрузки.
 */
const KEY = "tf_demo";
let memoryFlag = false;

export function isDemo(): boolean {
  if (memoryFlag) return true;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function enterDemo(): void {
  memoryFlag = true;
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // приватный режим: остаёмся в демо до перезагрузки
  }
}

export function exitDemo(): void {
  memoryFlag = false;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // нечего чистить
  }
}
