/**
 * Parser для task.journalLink (TEXT JSON) на клиенте.
 *
 * NB: это ДВА parser'а journalLink в проекте:
 *   • parseJournalLinkUI — strict для UI (требует kind/documentId/rowKey
 *     как строки, поддерживает siblingVisibility и label)
 *   • parseJournalLinkRaw — lenient (любой object, для taskScope-
 *     проверок и других UI-only полей не описанных в shared schema)
 *   • shared/journal-link.ts: parseJournalLink (Zod-validated, строгий)
 *
 * Каждый имеет свою цель — разные поля разной критичности. Использовать
 * правильный.
 */

export type ParsedJournalLink = {
  kind: string;
  documentId: string;
  rowKey: string;
  label?: string;
  /** Phase F — флаг «показывать siblings» от WeSetup. Default false. */
  siblingVisibility?: boolean;
};

/**
 * Lenient parser: возвращает raw JSON-объект целиком, без проверки
 * required полей. Подходит для access к UI-only полям таким как
 * `taskScope` (не в shared zod schema).
 *
 * Возвращает null для:
 *   • пустой строки / null / undefined
 *   • malformed JSON
 *   • не-object (number, string, null-literal)
 *   • array (Array.isArray check — иначе link.kind=undefined, но
 *     цикл итерации по числовым indices теоретически возможен)
 */
export function parseJournalLinkRaw(
  raw: string | null | undefined,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseJournalLinkUI(
  raw: string | null | undefined,
): ParsedJournalLink | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj !== "object" || obj === null) return null;
    const kind = obj.kind;
    const documentId = obj.documentId;
    const rowKey = obj.rowKey;
    if (
      typeof kind !== "string" ||
      typeof documentId !== "string" ||
      typeof rowKey !== "string"
    ) {
      return null;
    }
    return {
      kind,
      documentId,
      rowKey,
      label: typeof obj.label === "string" ? obj.label : undefined,
      siblingVisibility:
        typeof obj.siblingVisibility === "boolean"
          ? obj.siblingVisibility
          : false,
    };
  } catch {
    return null;
  }
}
