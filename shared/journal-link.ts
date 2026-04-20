/**
 * Когда задача создана в «Журнальном» режиме, поле `tasks.journal_link`
 * хранит JSON со ссылкой на конкретную строку журнала во внешней системе.
 *
 * Сейчас поддерживается единственный поставщик — `wesetup-cleaning`
 * (журнал уборки в WeSetup). Добавление других поставщиков делается
 * расширением union-а ниже плюс маппинга в API клиенте.
 *
 * Сериализованное значение — обычная строка JSON (без BOM/пробелов),
 * чтобы не пугать MySQL TEXT и сохранять портируемость.
 */
import { z } from "zod";

export const wesetupCleaningJournalLinkSchema = z.object({
  kind: z.literal("wesetup-cleaning"),
  baseUrl: z.string().url(),
  /** TasksFlowIntegration.id на стороне WeSetup. Не используется TasksFlow,
   *  только мы кладём для трассировки. */
  integrationId: z.string().optional().nullable(),
  /** JournalDocument.id в WeSetup. */
  documentId: z.string(),
  /** CleaningResponsiblePair.id внутри документа. */
  rowKey: z.string(),
  /** Человеко-читаемая метка, чтобы UI задач показывал «Уборка · Иван» без
   *  обращений к WeSetup. Опционально. */
  label: z.string().optional().nullable(),
});

export const journalLinkSchema = wesetupCleaningJournalLinkSchema; // union на будущее

export type JournalLink = z.infer<typeof journalLinkSchema>;

export function parseJournalLink(raw: string | null | undefined): JournalLink | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return journalLinkSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function stringifyJournalLink(link: JournalLink): string {
  return JSON.stringify(link);
}
