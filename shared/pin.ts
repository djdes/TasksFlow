import { z } from "zod";

/**
 * PIN для входа по телефону: 4 цифры. Общие правила для клиента и сервера,
 * чтобы форма сразу говорила то же, что ответит сервер.
 *
 * Простые PIN отсеиваем при задании: после 5 неверных попыток вход
 * блокируется, и перебирать имеет смысл только самые частые варианты —
 * их и не даём выбрать.
 */
export const PIN_LENGTH = 4;

const COMMON_PINS = new Set([
  "1212", "1004", "2000", "2001", "6969", "1122", "1313", "1010", "2020", "2580", "0852",
]);

/** Причина, по которой PIN не подходит для задания, или null. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "PIN — это 4 цифры";
  if (/^(\d)\1{3}$/.test(pin)) return "Слишком простой PIN: все цифры одинаковые";
  const digits = pin.split("").map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  if (ascending || descending) return "Слишком простой PIN: цифры идут подряд";
  if (COMMON_PINS.has(pin)) return "Этот PIN слишком частый — выберите другой";
  return null;
}

/** Любые 4 цифры — для проверки при входе. */
export const pinSchema = z.string().regex(/^\d{4}$/, "PIN — это 4 цифры");

/** Новый PIN: 4 цифры и не из простых. */
export const newPinSchema = z.string().superRefine((pin, ctx) => {
  const problem = pinProblem(pin);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

/** Равномерное случайное число [0, 1) из криптографического генератора. */
function secureRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/** Случайный «непростой» PIN для кнопки «Придумать». */
export function generatePin(random: () => number = secureRandom): string {
  for (;;) {
    const pin = String(Math.floor(random() * 10_000)).padStart(PIN_LENGTH, "0");
    if (!pinProblem(pin)) return pin;
  }
}

/** Согласие на обработку ПД при самостоятельной регистрации. */
export const consentSchema = z.literal(true, {
  errorMap: () => ({ message: "Нужно согласие на обработку персональных данных" }),
});
