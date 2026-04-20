import { buildMiniObligationEntryUrl } from "@/lib/journal-obligation-links";
import type { OpenJournalObligation } from "@/lib/journal-obligations";

type DigestCtaKind = "obligation" | "mini-app" | "cabinet";

export type TelegramObligationDigestCta = {
  kind: DigestCtaKind;
  label: string;
  url: string;
};

export type StaffObligationDigest = {
  kind: "staff";
  body: string;
  dedupeKey: string;
  openCount: number;
  nextObligationId: string | null;
  primaryCta: TelegramObligationDigestCta | null;
};

export type ManagerObligationSummary = {
  total: number;
  pending: number;
  done: number;
  employeesWithPending: number;
};

export type ManagerObligationDigest = {
  kind: "manager";
  body: string;
  dedupeKey: string;
  summary: ManagerObligationSummary;
  primaryCta: TelegramObligationDigestCta | null;
};

function dayStamp(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function formatObligationList(openObligations: OpenJournalObligation[]): string[] {
  const preview = openObligations.slice(0, 5).map((obligation) => {
    const suffix = obligation.template.description
      ? ` (${obligation.template.description})`
      : "";
    return `• ${obligation.template.name}${suffix}`;
  });

  if (openObligations.length > preview.length) {
    preview.push(`…и ещё ${openObligations.length - preview.length}`);
  }

  return preview;
}

export function buildStaffObligationDigest(args: {
  userId: string;
  staffName: string;
  openObligations: OpenJournalObligation[];
  miniAppBaseUrl: string | null;
  now?: Date;
}): StaffObligationDigest | null {
  if (args.openObligations.length === 0) {
    return null;
  }

  const now = args.now ?? new Date();
  const nextObligation = args.openObligations[0] ?? null;
  const miniAppBaseUrl = normalizeUrl(args.miniAppBaseUrl);
  const primaryCta =
    miniAppBaseUrl && nextObligation
      ? {
          kind: "obligation" as const,
          label: "Открыть задачу",
          url: buildMiniObligationEntryUrl(miniAppBaseUrl, nextObligation.id),
        }
      : miniAppBaseUrl
        ? {
            kind: "mini-app" as const,
            label: "Открыть журналы",
            url: miniAppBaseUrl,
          }
        : null;

  const body = [
    `Доброе утро, ${args.staffName}!`,
    "",
    `Открыто задач: ${args.openObligations.length}`,
    nextObligation
      ? `Следующее действие: ${nextObligation.template.name}`
      : "Следующее действие пока не найдено.",
    "",
    "На сегодня:",
    ...formatObligationList(args.openObligations),
  ].join("\n");

  return {
    kind: "staff",
    body,
    dedupeKey: `telegram-digest:staff:${dayStamp(now)}:${args.userId}`,
    openCount: args.openObligations.length,
    nextObligationId: nextObligation?.id ?? null,
    primaryCta,
  };
}

export function buildManagerObligationDigest(args: {
  organizationId: string;
  organizationName: string;
  summary: ManagerObligationSummary;
  cabinetUrl: string | null;
  now?: Date;
}): ManagerObligationDigest {
  const now = args.now ?? new Date();
  const cabinetUrl = normalizeUrl(args.cabinetUrl);

  return {
    kind: "manager",
    body: [
      `Доброе утро, ${args.organizationName}!`,
      "",
      `Открыто: ${args.summary.pending} · Выполнено: ${args.summary.done}`,
      `Всего обязательств: ${args.summary.total}`,
      `Сотрудников с открытыми задачами: ${args.summary.employeesWithPending}`,
    ].join("\n"),
    dedupeKey: `telegram-digest:manager:${dayStamp(now)}:${args.organizationId}`,
    summary: args.summary,
    primaryCta: cabinetUrl
      ? {
          kind: "cabinet",
          label: "Открыть кабинет",
          url: cabinetUrl,
        }
      : null,
  };
}
