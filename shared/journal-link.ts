/**
 * Когда задача создана в «Журнальном» режиме, поле `tasks.journal_link`
 * хранит JSON со ссылкой на конкретную строку журнала во внешней системе.
 *
 * Сейчас TasksFlow принимает любой WeSetup journal kind вида
 * `wesetup-<templateCode>`, а не только `wesetup-cleaning`.
 * Это нужно для универсального «журнального режима», где админ может
 * создавать задачи из любого журнала WeSetup.
 *
 * Сериализованное значение — обычная строка JSON (без BOM/пробелов),
 * чтобы не пугать MySQL TEXT и сохранять портируемость.
 */
import { z } from "zod";

export const wesetupJournalLinkSchema = z.object({
  kind: z.string().regex(/^wesetup-[a-z0-9_:-]+$/i),
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
  /** Отличает свободную журнальную задачу от привязки к adapter row. */
  isFreeText: z.boolean().optional(),
  /**
   * Сумма премии за выполнение в копейках. Когда > 0 и задача
   * fan-out-нута на нескольких сотрудников — это «race-for-bonus»:
   * первый кто выполнит, забирает премию, остальные получают
   * `claimedByWorkerId` и уезжают в «Сделано другими» в Dashboard.
   * Опционально для совместимости со старыми задачами без этого поля.
   */
  bonusAmountKopecks: z.number().int().nonnegative().optional(),
});

export const journalLinkSchema = wesetupJournalLinkSchema;

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

export function getJournalLinkIntegrationId(
  raw: string | null | undefined
): string | null {
  return parseJournalLink(raw)?.integrationId ?? null;
}

export function stringifyJournalLink(link: JournalLink): string {
  return JSON.stringify(link);
}
