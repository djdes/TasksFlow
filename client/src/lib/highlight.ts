/**
 * Pure-helper'ы для search-highlight в HighlightedText компоненте.
 * Извлечено чтобы тестировать без JSX.
 */

/**
 * Эскейпит regex meta-символы. Безопасно для произвольной user-input
 * строки (защита от ReDoS / regex-injection в случайных символах
 * типа `(.*)+`).
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type HighlightSegment = {
  text: string;
  isMatch: boolean;
};

/**
 * Разбивает text на сегменты (match / non-match) по query.
 * Регистр игнорируется. Пустой query — один сегмент isMatch=false
 * со всем text'ом. Если в text нет совпадений — также один сегмент
 * со всем text.
 *
 *   splitForHighlight("Помыть пол", "пол") →
 *     [{text:"Помыть ", isMatch:false}, {text:"пол", isMatch:true}]
 *
 *   splitForHighlight("ПОМЫТЬ", "мыть") →
 *     [{text:"ПО", isMatch:false}, {text:"МЫТЬ", isMatch:true}]
 *
 * Multi-match:
 *   splitForHighlight("ababab", "b") →
 *     5 сегментов: ['a','b','a','b','a','b'] — alternating
 */
export function splitForHighlight(
  text: string,
  query: string | null | undefined,
): HighlightSegment[] {
  const trimmed = (query ?? "").trim();
  if (!trimmed) return [{ text, isMatch: false }];
  const re = new RegExp(`(${escapeRegex(trimmed)})`, "gi");
  const parts = text.split(re);
  // String.split с capture group — alternating: text[0]=before, [1]=match,
  // [2]=between, ... Индексы odd = match (если capture matched).
  return parts.map((part, i) => ({
    text: part,
    isMatch: i % 2 === 1 && part.length > 0,
  }));
}
