"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAILY_JOURNAL_CODES } from "@/lib/daily-journal-codes";
import {
  AlertCircle,
  ArrowRight,
  BookHeart,
  Brush,
  Bug,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  Eye,
  Fan,
  FileText,
  Flame,
  Gauge,
  Gift,
  GraduationCap,
  HandHeart,
  HardHat,
  HeartPulse,
  Lightbulb,
  Magnet,
  MessageSquareWarning,
  NotebookPen,
  Package,
  PackageCheck,
  PackageX,
  Route,
  Search,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
  SprayCan,
  Thermometer,
  TriangleAlert,
  Truck,
  Wine,
  Wrench,
  X,
} from "lucide-react";

type JournalTemplateListItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isMandatorySanpin: boolean;
  isMandatoryHaccp: boolean;
  filledToday: boolean;
};

type JournalsBrowserProps = {
  templates: JournalTemplateListItem[];
};

const JOURNAL_ICONS: Record<string, LucideIcon> = {
  hygiene: HandHeart,
  health_check: HeartPulse,
  climate_control: Thermometer,
  cold_equipment_control: Snowflake,
  cleaning_ventilation_checklist: Fan,
  cleaning: Brush,
  general_cleaning: Sparkles,
  uv_lamp_runtime: Lightbulb,
  finished_product: Package,
  perishable_rejection: PackageX,
  incoming_control: PackageCheck,
  fryer_oil: Flame,
  med_books: BookHeart,
  training_plan: CalendarCheck,
  staff_training: GraduationCap,
  disinfectant_usage: SprayCan,
  sanitary_day_control: CalendarClock,
  equipment_maintenance: Wrench,
  breakdown_history: TriangleAlert,
  equipment_calibration: Gauge,
  incoming_raw_materials_control: Truck,
  ppe_issuance: HardHat,
  accident_journal: ShieldAlert,
  complaint_register: MessageSquareWarning,
  product_writeoff: PackageX,
  audit_plan: ClipboardList,
  audit_protocol: ClipboardCheck,
  audit_report: FileText,
  traceability_test: Route,
  metal_impurity: Magnet,
  equipment_cleaning: Droplets,
  intensive_cooling: Snowflake,
  glass_items_list: Wine,
  glass_control: Eye,
  pest_control: Bug,
};

function normalizeSearchValue(value: string) {
  return value.toLocaleLowerCase("ru-RU").trim();
}

export function JournalsBrowser({ templates }: JournalsBrowserProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearchValue(deferredQuery);

  const filteredTemplates = useMemo(() => {
    if (!normalizedQuery) return templates;
    return templates.filter((template) => {
      const searchableText = normalizeSearchValue(
        [template.name, template.description, template.code].filter(Boolean).join(" ")
      );
      return searchableText.includes(normalizedQuery);
    });
  }, [templates, normalizedQuery]);

  const totalCount = templates.length;
  const mandatoryTemplates = templates.filter(
    (t) => t.isMandatorySanpin || t.isMandatoryHaccp
  );
  const mandatoryCount = mandatoryTemplates.length;
  // Only daily journals contribute to «нужно заполнить сегодня». Aperiodic
  // mandatory journals (complaints, accidents, audits, …) don't have a
  // daily obligation and should neither tug the progress bar nor show up
  // as «pending today».
  const dailyMandatoryTemplates = mandatoryTemplates.filter((t) =>
    DAILY_JOURNAL_CODES.has(t.code)
  );
  const dailyMandatoryCount = dailyMandatoryTemplates.length;
  const filledTodayCount = dailyMandatoryTemplates.filter((t) => t.filledToday).length;
  const pendingTodayCount = dailyMandatoryCount - filledTodayCount;
  const compliancePercent = dailyMandatoryCount
    ? Math.round((filledTodayCount / dailyMandatoryCount) * 100)
    : 100;

  const hasResults = filteredTemplates.length > 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-[#ececf4] bg-[#0b1024] text-white shadow-[0_20px_60px_-30px_rgba(11,16,36,0.55)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[420px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-40 -right-32 size-[460px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
          <div className="absolute left-1/3 top-1/2 size-[280px] rounded-full bg-[#3d4efc] opacity-25 blur-[100px]" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at 30% 40%, black 40%, transparent 70%)",
          }}
        />
        <div className="relative z-10 p-8 md:p-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <NotebookPen className="size-6" />
              </div>
              <div>
                <h1 className="text-[clamp(1.625rem,1.5vw+1.2rem,2rem)] font-semibold leading-tight tracking-[-0.02em]">
                  Журналы
                </h1>
                <p className="mt-1 max-w-[540px] text-[15px] text-white/70">
                  Электронные журналы СанПиН и ХАССП. Выберите журнал, чтобы
                  посмотреть записи, создать новые или распечатать отчёт.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#7cf5c0]/40 bg-[#7cf5c0]/10 px-3 py-1.5 text-[12px] uppercase tracking-[0.18em] text-[#7cf5c0] backdrop-blur">
                <Gift className="size-3.5" />
                Все журналы бесплатно
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] uppercase tracking-[0.18em] text-white/80 backdrop-blur">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    compliancePercent >= 90
                      ? "bg-[#7cf5c0]"
                      : compliancePercent >= 60
                        ? "bg-[#ffd466]"
                        : "bg-[#ffb0a6]"
                  )}
                />
                Готовность сегодня: {compliancePercent}%
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <StatPill label="Всего" value={totalCount} />
            <StatPill label="Обязательных" value={mandatoryCount} />
            <StatPill
              label="Заполнено сегодня"
              value={filledTodayCount}
              hint={
                dailyMandatoryCount === 0
                  ? undefined
                  : `из ${dailyMandatoryCount}`
              }
            />
            <StatPill
              label="Надо заполнить"
              value={pendingTodayCount}
              hint={pendingTodayCount === 0 ? "всё готово" : "журналов"}
              alert={pendingTodayCount > 0}
            />
          </div>
        </div>
      </section>

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#9b9fb3]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию, описанию или коду"
            aria-label="Поиск по журналам"
            className="h-12 w-full rounded-2xl border border-[#dcdfed] bg-white pl-11 pr-11 text-[15px] text-[#0b1024] placeholder:text-[#c1c5d6] shadow-[0_0_0_1px_rgba(240,240,250,0.45)] transition-[border-color,box-shadow] focus:border-[#5566f6] focus:outline-none focus:ring-4 focus:ring-[#5566f6]/15"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-[#9b9fb3] transition-colors hover:bg-[#f5f6ff] hover:text-[#5566f6]"
              aria-label="Очистить поиск"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <div className="text-[13px] text-[#6f7282]">
          {normalizedQuery
            ? `Найдено ${filteredTemplates.length} из ${totalCount}`
            : `Всего журналов: ${totalCount}`}
        </div>
      </div>

      {!hasResults ? (
        <EmptyState onReset={() => setQuery("")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: number;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm ring-1 ring-white/10",
        alert && "bg-white/15 ring-white/30"
      )}
    >
      <div className="text-[26px] font-semibold leading-none tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 text-[12px] text-white/60">{label}</div>
      {hint ? (
        <div
          className={cn(
            "mt-0.5 text-[11px]",
            alert ? "text-[#ffd466]" : "text-white/40"
          )}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function TemplateCard({ template }: { template: JournalTemplateListItem }) {
  const Icon = JOURNAL_ICONS[template.code] ?? NotebookPen;
  const isMandatory = template.isMandatorySanpin || template.isMandatoryHaccp;
  const isDaily = DAILY_JOURNAL_CODES.has(template.code);
  const needsAttentionToday = isMandatory && isDaily && !template.filledToday;
  const readyToday = isMandatory && isDaily && template.filledToday;

  return (
    <Link href={`/journals/${template.code}`} className="group block focus:outline-none">
      <div
        className={cn(
          "flex h-full items-start gap-4 rounded-2xl border bg-white px-5 py-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] transition-all hover:shadow-[0_8px_24px_-12px_rgba(85,102,246,0.18)] group-focus-visible:border-[#5566f6] group-focus-visible:ring-4 group-focus-visible:ring-[#5566f6]/15",
          needsAttentionToday
            ? "border-[#ffd2cd] hover:border-[#ff8d7d]"
            : readyToday
              ? "border-[#c8f0d5] hover:border-[#7cf5c0]"
              : "border-[#ececf4] hover:border-[#d6d9ee]"
        )}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f5f6ff] text-[#5566f6] transition-transform group-hover:scale-105">
          <Icon className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[15px] font-semibold leading-snug text-[#0b1024]">
              {template.name}
            </div>
            <ArrowRight className="size-4 shrink-0 translate-y-0.5 text-[#c7ccea] transition-all group-hover:translate-x-0.5 group-hover:text-[#5566f6]" />
          </div>
          {template.description ? (
            <div className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#6f7282]">
              {template.description}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {needsAttentionToday ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4f2] px-2 py-0.5 text-[11px] font-medium text-[#d2453d]">
                <AlertCircle className="size-3" />
                Заполнить сегодня
              </span>
            ) : readyToday ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[11px] font-medium text-[#136b2a]">
                <CheckCircle2 className="size-3" />
                Сегодня готово
              </span>
            ) : null}
            {template.isMandatorySanpin ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4f2] px-2 py-0.5 text-[11px] font-medium text-[#d2453d]">
                <ShieldCheck className="size-3" />
                СанПиН
              </span>
            ) : null}
            {template.isMandatoryHaccp ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#eef1ff] px-2 py-0.5 text-[11px] font-medium text-[#5566f6]">
                <ShieldAlert className="size-3" />
                ХАССП
              </span>
            ) : null}
            <span className="ml-auto rounded-full bg-[#f5f6ff] px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[#9b9fb3]">
              {template.code}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-[#dcdfed] bg-white px-6 py-16 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#f5f6ff] text-[#5566f6]">
        <SearchX className="size-7" />
      </div>
      <p className="mt-4 text-[17px] font-semibold text-[#0b1024]">
        Ничего не найдено
      </p>
      <p className="mt-2 text-[14px] text-[#6f7282]">
        Попробуйте изменить запрос или очистить поиск.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[13px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
      >
        Очистить поиск
        <X className="size-4 text-[#5566f6]" />
      </button>
    </div>
  );
}
