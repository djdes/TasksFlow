/**
 * Russian plural form selector с учётом исключения 11-14
 * (числа от 11 до 14 звучат как «много» несмотря на оканчивание).
 *
 * Раньше использовалась грубая проверка `count < 5` — она работает
 * только для 1-10. Для 21 ("Задача"), 22-24 ("Задачи"), 121, 1011...
 * грубое правило срывалось. Этот helper покрывает любые числа.
 *
 *   pluralizeRu(1)  → "one"
 *   pluralizeRu(2)  → "few"
 *   pluralizeRu(5)  → "many"
 *   pluralizeRu(11) → "many"   ← исключение
 *   pluralizeRu(21) → "one"
 *   pluralizeRu(22) → "few"
 *   pluralizeRu(25) → "many"
 *   pluralizeRu(0)  → "many"
 */
export function pluralizeRu(count: number): "one" | "few" | "many" {
  const lastTwo = Math.abs(count) % 100;
  const last = Math.abs(count) % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "many";
  if (last === 1) return "one";
  if (last >= 2 && last <= 4) return "few";
  return "many";
}

/**
 * Удобный shortcut: выбирает одну из трёх форм по числу.
 *
 *   plural(1, "день", "дня", "дней")   → "день"
 *   plural(3, "день", "дня", "дней")   → "дня"
 *   plural(11, "день", "дня", "дней")  → "дней"
 */
export function plural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const form = pluralizeRu(count);
  return form === "one" ? one : form === "few" ? few : many;
}
