import type { ChecklistItem } from "./schema";

/**
 * Контракт журнала дня и сводки (GET /api/history, /api/reports/summary).
 * Прошлые дни — из task_history, сегодняшний — из живых задач, поэтому у
 * сегодня вместо «не выполнено» бывает «ждёт».
 */
export type HistoryStatus = "done" | "claimed" | "missed" | "submitted" | "pending";

export type HistoryItem = {
  key: string;
  taskId: number;
  workerId: number | null;
  day: string;
  title: string;
  category: string | null;
  status: HistoryStatus;
  completedAt: number | null;
  /** «ЧЧ:ММ» по поясу компании. */
  time: string | null;
  photoUrls: string[];
  checklist: ChecklistItem[] | null;
  price: number;
  claimedByWorkerId: number | null;
  verificationStatus: string | null;
};

export type HistoryDayResponse = { day: string; today: string; timezone: string; items: HistoryItem[] };

export type PersonSummary = {
  workerId: number;
  name: string;
  done: number;
  claimed: number;
  missed: number;
  pending: number;
  bonus: number;
  photos: number;
  /** Доля сделанного из того, что было в расписании; null — нечего считать. */
  rate: number | null;
};

export type DaySummary = { day: string; done: number; missed: number };

export type SummaryTotals = { done: number; claimed: number; missed: number; pending: number; bonus: number };

export type ReportSummaryResponse = {
  from: string;
  to: string;
  today: string;
  timezone: string;
  people: PersonSummary[];
  days: DaySummary[];
  totals: SummaryTotals;
};
