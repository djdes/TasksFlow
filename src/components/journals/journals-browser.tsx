"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Crown, Lock, Search, ShieldAlert, ShieldCheck, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  JOURNAL_TARIFF_DESCRIPTIONS,
  JOURNAL_TARIFF_LABELS,
  JOURNAL_TARIFF_ORDER,
  canAccessTariff,
  type JournalTariff,
} from "@/lib/journal-tariffs";

type JournalTemplateListItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isMandatorySanpin: boolean;
  isMandatoryHaccp: boolean;
  tariff: JournalTariff;
};

type JournalsBrowserProps = {
  templates: JournalTemplateListItem[];
  subscriptionPlan: string | null | undefined;
};

function normalizeSearchValue(value: string) {
  return value.toLocaleLowerCase("ru-RU").trim();
}

export function JournalsBrowser({ templates, subscriptionPlan }: JournalsBrowserProps) {
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

  const grouped = useMemo(() => {
    const map = new Map<JournalTariff, JournalTemplateListItem[]>();
    for (const tariff of JOURNAL_TARIFF_ORDER) map.set(tariff, []);
    for (const t of filteredTemplates) {
      const arr = map.get(t.tariff) ?? [];
      arr.push(t);
      map.set(t.tariff, arr);
    }
    return map;
  }, [filteredTemplates]);

  const totalCount = templates.length;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold">Журналы</h1>
          <p className="text-sm text-muted-foreground">
            Найдите журнал по названию, описанию или коду. Журналы сгруппированы
            по тарифному плану.
          </p>
        </div>

        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по журналам"
            aria-label="Поиск по журналам"
            className="h-11 rounded-xl pl-9 pr-11"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Очистить поиск"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {normalizedQuery ? (
          <p className="text-sm text-muted-foreground">
            Найдено: {filteredTemplates.length} из {totalCount}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Всего журналов: {totalCount}
          </p>
        )}
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
          <p className="text-base font-medium">Ничего не найдено</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Попробуйте изменить запрос или очистить поиск.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {JOURNAL_TARIFF_ORDER.map((tariff) => {
            const list = grouped.get(tariff) ?? [];
            if (list.length === 0) return null;
            const accessible = canAccessTariff(subscriptionPlan, tariff);

            return (
              <TariffSection
                key={tariff}
                tariff={tariff}
                templates={list}
                accessible={accessible}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TariffSection({
  tariff,
  templates,
  accessible,
}: {
  tariff: JournalTariff;
  templates: JournalTemplateListItem[];
  accessible: boolean;
}) {
  const isExtended = tariff === "extended";
  const accent = isExtended
    ? "from-amber-500/10 via-amber-400/5 to-transparent border-amber-300/60 dark:border-amber-400/30"
    : "from-sky-500/10 via-sky-400/5 to-transparent border-sky-300/60 dark:border-sky-400/30";
  const HeaderIcon = isExtended ? Crown : Sparkles;
  const headerIconClass = isExtended
    ? "text-amber-600 dark:text-amber-400"
    : "text-sky-600 dark:text-sky-400";

  return (
    <section className="space-y-4">
      <div
        className={cn(
          "flex flex-col gap-2 rounded-2xl border bg-gradient-to-r px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
          accent
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/70 shadow-sm",
              headerIconClass
            )}
            aria-hidden="true"
          >
            <HeaderIcon className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                Тариф «{JOURNAL_TARIFF_LABELS[tariff]}»
              </h2>
              <Badge
                variant={isExtended ? "default" : "secondary"}
                className="h-5 px-1.5 py-0 text-[10px]"
              >
                {templates.length}
              </Badge>
              {!accessible ? (
                <Badge
                  variant="outline"
                  className="h-5 gap-1 px-1.5 py-0 text-[10px]"
                >
                  <Lock className="size-3" /> требуется подписка
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {JOURNAL_TARIFF_DESCRIPTIONS[tariff]}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            accessible={accessible}
          />
        ))}
      </div>
    </section>
  );
}

function TemplateCard({
  template,
  accessible,
}: {
  template: JournalTemplateListItem;
  accessible: boolean;
}) {
  const card = (
    <Card
      className={cn(
        "h-full cursor-pointer rounded-2xl transition-shadow hover:shadow-md",
        accessible ? null : "opacity-90"
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{template.name}</CardTitle>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {template.tariff === "extended" ? (
              <Badge
                variant="default"
                className="h-5 shrink-0 gap-0.5 bg-amber-500 px-1.5 py-0 text-[10px] text-white hover:bg-amber-500"
              >
                <Crown className="size-3" /> Расш.
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="h-5 shrink-0 gap-0.5 px-1.5 py-0 text-[10px]"
              >
                <Sparkles className="size-3" /> Базовый
              </Badge>
            )}
            {template.isMandatorySanpin ? (
              <Badge
                variant="destructive"
                className="h-5 shrink-0 px-1.5 py-0 text-[10px]"
              >
                <ShieldCheck className="mr-0.5 size-3" />
                СанПиН
              </Badge>
            ) : null}
            {template.isMandatoryHaccp ? (
              <Badge
                variant="default"
                className="h-5 shrink-0 px-1.5 py-0 text-[10px]"
              >
                <ShieldAlert className="mr-0.5 size-3" />
                ХАССП
              </Badge>
            ) : null}
          </div>
        </div>
        {template.description ? (
          <CardDescription>{template.description}</CardDescription>
        ) : null}
        {!accessible ? (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" /> Доступен на тарифе «Расширенный»
          </p>
        ) : null}
      </CardHeader>
    </Card>
  );

  // Gating is soft for now: we show the lock badge but keep the card clickable
  // so existing customers don't lose access to journals they were already using.
  // Hard gating will be enforced once billing/plan selection UI ships.
  return (
    <Link href={`/journals/${template.code}`} className="block">
      {card}
    </Link>
  );
}
