/**
 * Resilient JSON parser для server-error responses.
 *
 * useUncompleteTask и TaskViewDialog получают `await res.text()`,
 * парсят как JSON чтобы достать `data.message`, но silently fallback'ят
 * на {} если text пустой / не JSON / corrupted.
 *
 * Извлечено в shared helper чтобы:
 *   • DRY (был дубликат в 2 местах)
 *   • защита от non-object JSON (типа `'42'` или `'null'`) — раньше
 *     `data.message` бы вернул undefined, но через `as any` могли
 *     вылезти странные ошибки на bracket-access.
 *   • single-source-of-truth для defensive HTTP error parsing.
 */

export function parseJsonOrEmpty(text: string | null | undefined): Record<string, unknown> {
  if (!text || !text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}
