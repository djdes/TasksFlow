/**
 * Parser для task.journalLink (TEXT JSON) на клиенте. Тот же формат
 * что в server/journal-link.ts, но без zod — только нужные поля для
 * UI. Возвращает null если поле некорректное (старая schema или мусор).
 */

export type ParsedJournalLink = {
  kind: string;
  documentId: string;
  rowKey: string;
  label?: string;
  /** Phase F — флаг «показывать siblings» от WeSetup. Default false. */
  siblingVisibility?: boolean;
};

export function parseJournalLink(raw: string | null | undefined): ParsedJournalLink | null {
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
