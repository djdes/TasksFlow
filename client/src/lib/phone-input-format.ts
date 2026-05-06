/**
 * Pure normalizer для PhoneInput.tsx.
 *
 * Inputs из <input type="tel"> могут быть в любой форме после copy-paste,
 * autofill или ручного ввода. Cleanup'ит до канонического "+7XXXXXXXXXX"
 * (12 символов, prefix +7 + 10 цифр).
 *
 * Извлечено для unit-тестирования (PhoneInput — controlled component
 * с tightly-coupled DOM events).
 *
 * История багов (защита через тесты):
 *   • "+78005553535" → раньше "+7" + "78005553535" = "+778005553535"
 *     (двойной 7). Защищён condition: если digits.startsWith("7"),
 *     срезаем первую цифру.
 *   • Длинный paste "+7 (495) 123-45-67 ext.55" → должно ограничиться
 *     первыми 10 цифрами после +7.
 */

export function formatPhoneInput(raw: string): string {
  // Снимаем существующий "+" и "7" (или "+7") в начале — добавим сами.
  const cleaned = raw.replace(/^\+?7?/, "");
  let digits = cleaned.replace(/\D/g, "");
  // Если после удаления "+7"-prefix первая цифра всё ещё 7 (потому что
  // юзер ввёл "+77999..." или "78005553535"), убираем её. Без этого
  // получили бы "+778005..." (двойной 7).
  if (digits.startsWith("7") && digits.length > 1) {
    digits = digits.slice(1);
  }
  const limited = digits.slice(0, 10);
  return "+7" + limited;
}
