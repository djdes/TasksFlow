import { AlertCircle, CheckCircle2 } from "lucide-react";
import { DAILY_JOURNAL_CODES } from "@/lib/today-compliance";

/**
 * Top-of-page banner for a journal's documents list. Tells staff at a
 * glance whether the day's record has been entered yet. Read-only —
 * the page/list is the action surface; this is just a status reminder.
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
}: {
  filled: boolean;
  isMandatory: boolean;
  templateCode: string;
  templateName: string;
}) {
  if (!isMandatory) return null;
  if (!DAILY_JOURNAL_CODES.has(templateCode)) return null;

  if (filled) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-[#c8f0d5] bg-[#ecfdf5] px-4 py-3 sm:px-5 sm:py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#d9f4e1] text-[#136b2a]">
          <CheckCircle2 className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-[#136b2a]">
            Сегодня записи уже есть
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-[#136b2a]/80">
            {templateName} заполнен за сегодняшнее число. Можно открыть документ,
            чтобы проверить или дополнить записи.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#ffd2cd] bg-[#fff4f2] px-4 py-3 sm:px-5 sm:py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ffe1dc] text-[#d2453d]">
        <AlertCircle className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-[#d2453d]">
          Нужно заполнить за сегодняшнее число
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-[#d2453d]/85">
          За сегодня заполнены ещё не все строки. Откройте активный документ и
          внесите данные по каждой строке за текущий день — как только все
          обязательные записи будут внесены, этот блок исчезнет.
        </p>
      </div>
    </div>
  );
}
