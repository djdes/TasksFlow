import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  ALL_DAILY_JOURNAL_CODES,
  COUNTS_UNBOUNDED_CODES,
} from "@/lib/daily-journal-codes";

// Russian plural pick: `pluralRu(1,2,5)(count)` for the three grammatical
// forms. Handles teens (11-14 always 3rd form) and 21/31/41/... (1st form)
// correctly — keeps banner copy readable even for big row counts.
function pluralRu(one: string, few: string, many: string) {
  return (count: number) => {
    const abs = Math.abs(count) % 100;
    const lastDigit = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (lastDigit === 1) return one;
    if (lastDigit >= 2 && lastDigit <= 4) return few;
    return many;
  };
}

const recordWord = pluralRu("запись", "записи", "записей");

/**
 * Top-of-page banner for a journal's documents list. Tells staff at a
 * glance whether the day's record has been entered yet and gives them a
 * one-tap path straight to the active document (scrolled to today's
 * date when the client supports it).
 *
 * Shown only for daily journals (hygiene, temperatures, cleaning,
 * etc.). Aperiodic journals (accidents, complaints, audits…) don't
 * have daily obligations, so no banner — nothing to remind anyone of.
 */
export function TodayPendingBanner({
  filled,
  isMandatory,
  templateCode,
  templateName,
  routeCode,
  activeDocumentId = null,
  todayCount = 0,
  expectedCount = 0,
  noActiveDocument = false,
}: {
  filled: boolean;
  isMandatory: boolean;
  templateCode: string;
  templateName: string;
  /** URL segment for `/journals/{routeCode}/...` — the raw `code` from
   * the route, NOT the alias-resolved template code. When omitted, the
   * «Перейти» button is hidden. */
  routeCode?: string;
  activeDocumentId?: string | null;
  todayCount?: number;
  expectedCount?: number;
  noActiveDocument?: boolean;
}) {
  if (!isMandatory) return null;
  if (!ALL_DAILY_JOURNAL_CODES.has(templateCode)) return null;

  const countsAreBounded = !COUNTS_UNBOUNDED_CODES.has(templateCode);
  const openUrl =
    routeCode && activeDocumentId
      ? `/journals/${routeCode}/documents/${activeDocumentId}?focus=today`
      : null;

  if (filled) {
    const greenDetail = countsAreBounded && expectedCount > 0
      ? ` (${todayCount} из ${expectedCount} строк)`
      : todayCount > 0
        ? ` (${todayCount} ${recordWord(todayCount)})`
        : "";
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-[#c8f0d5] bg-[#ecfdf5] px-4 py-3 sm:flex-row sm:items-center sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-start gap-3 sm:flex-1">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#d9f4e1] text-[#136b2a]">
            <CheckCircle2 className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-[#136b2a]">
              Сегодня записи уже есть
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-[#136b2a]/80">
              {templateName} заполнен за сегодняшнее число{greenDetail}.
              Можно открыть документ, чтобы проверить или дополнить записи.
            </p>
          </div>
        </div>
        {openUrl ? (
          <Link
            href={openUrl}
            className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#136b2a] px-4 text-[13px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(19,107,42,0.55)] transition-colors hover:bg-[#0f5a22] sm:w-auto"
          >
            Открыть за сегодня
            <ArrowRight className="size-4" />
          </Link>
        ) : null}
      </div>
    );
  }

  // Tailor the body copy to the state — no doc, partial fill, or empty.
  const partialFill = countsAreBounded && todayCount > 0 && expectedCount > 0;
  const description = noActiveDocument
    ? "Активного документа на сегодня нет. Создайте новый документ кнопкой «Создать документ» сверху и начните заполнять записи за текущий день."
    : partialFill
      ? `За сегодня заполнено ${todayCount} из ${expectedCount} строк. Нажмите «Перейти к сегодня» и внесите оставшиеся — как только все обязательные строки будут готовы, этот блок исчезнет.`
      : countsAreBounded
        ? "За сегодня ещё нет записей. Нажмите «Перейти к сегодня» и внесите данные за текущий день — как только все обязательные строки будут готовы, этот блок исчезнет."
        : "За сегодня ещё нет ни одной записи. Откройте активный документ и внесите данные по событиям текущего дня.";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#ffd2cd] bg-[#fff4f2] px-4 py-3 sm:flex-row sm:items-center sm:px-5 sm:py-4">
      <div className="flex min-w-0 items-start gap-3 sm:flex-1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ffe1dc] text-[#d2453d]">
          <AlertCircle className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-[#d2453d]">
            Нужно заполнить за сегодняшнее число
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-[#d2453d]/85">
            {description}
          </p>
        </div>
      </div>
      {openUrl ? (
        <Link
          href={openUrl}
          className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#d2453d] px-4 text-[13px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(210,69,61,0.55)] transition-colors hover:bg-[#b83a33] sm:w-auto"
        >
          Перейти к сегодня
          <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
