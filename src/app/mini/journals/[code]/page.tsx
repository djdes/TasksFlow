"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Plus } from "lucide-react";

type EntryItem = {
  id: string;
  createdAt: string;
  status: string;
  data: Record<string, unknown>;
  filledBy?: { name: string | null } | null;
};

type DocItem = {
  id: string;
  title: string;
  status: string;
  dateFrom: string;
  dateTo: string;
};

type Payload = {
  template: { code: string; name: string; description: string | null };
  isDocument: boolean;
  entries: EntryItem[];
  documents?: DocItem[];
};

export default function MiniJournalPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const resp = await fetch(`/api/mini/journals/${code}/entries`, {
          cache: "no-store",
        });
        if (!resp.ok) {
          const body = (await resp.json().catch(() => ({ error: "" }))) as {
            error?: string;
          };
          throw new Error(body.error || `HTTP ${resp.status}`);
        }
        const data = (await resp.json()) as Payload;
        if (!aborted) setPayload(data);
      } catch (err) {
        if (!aborted) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }
  if (!payload) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
        Загружаем…
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-28">
      <BackLink />
      <header className="px-1">
        <h1 className="text-[20px] font-semibold text-slate-900">
          {payload.template.name}
        </h1>
        {payload.template.description ? (
          <p className="mt-1 text-[13px] text-slate-500">
            {payload.template.description}
          </p>
        ) : null}
      </header>

      {payload.isDocument ? (
        <DocumentJournalBody
          code={code}
          documents={payload.documents ?? []}
        />
      ) : (
        <FieldJournalBody code={code} entries={payload.entries} />
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/mini"
      className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500"
    >
      <ArrowLeft className="size-4" />
      На главную
    </Link>
  );
}

function FieldJournalBody({
  code,
  entries,
}: {
  code: string;
  entries: EntryItem[];
}) {
  return (
    <>
      <section className="space-y-2">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Последние записи
        </h2>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-[14px] text-slate-500">
            Пока нет записей за 7 дней. Создайте первую.
          </div>
        ) : (
          entries.map((e) => <EntryRow key={e.id} entry={e} />)
        )}
      </section>

      <Link
        href={`/mini/journals/${code}/new`}
        className="fixed inset-x-0 bottom-4 z-10 mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-[15px] font-semibold text-white shadow-lg active:scale-[0.98]"
      >
        <Plus className="size-5" />
        Новая запись
      </Link>
    </>
  );
}

function DocumentJournalBody({
  code,
  documents,
}: {
  code: string;
  documents: DocItem[];
}) {
  return (
    <>
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-[13px] leading-5 text-indigo-800">
        Этот журнал ведётся таблицей за период. В v1 заполнение таблицы
        доступно на сайте — в один тап по кнопке ниже. Список ваших смен
        синхронизирован с сайтом.
      </div>

      <section className="space-y-2">
        <h2 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          Мои таблицы
        </h2>
        {documents.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-[14px] text-slate-500">
            Руководитель ещё не создал ни одного документа этого типа.
          </div>
        ) : (
          documents.map((d) => {
            const dateRange = formatDateRange(d.dateFrom, d.dateTo);
            return (
              <a
                key={d.id}
                href={`/journals/${code}/documents/${d.id}`}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 active:scale-[0.98]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-slate-900">
                    {d.title || dateRange}
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-500">
                    {dateRange}
                    {d.status === "closed" ? " · закрыт" : ""}
                  </div>
                </div>
                <ExternalLink className="size-4 shrink-0 text-slate-400" />
              </a>
            );
          })
        )}
      </section>
    </>
  );
}

function EntryRow({ entry }: { entry: EntryItem }) {
  const dt = new Date(entry.createdAt).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const preview = entryPreview(entry.data);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-medium text-slate-900">{dt}</div>
        <div className="text-[11px] text-slate-500">
          {entry.filledBy?.name ?? "—"}
        </div>
      </div>
      {preview ? (
        <div className="mt-1 line-clamp-2 text-[12px] text-slate-600">
          {preview}
        </div>
      ) : null}
    </div>
  );
}

function entryPreview(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (parts.length >= 3) break;
    if (value == null) continue;
    if (typeof value === "boolean") {
      parts.push(`${key}: ${value ? "да" : "нет"}`);
    } else if (typeof value === "number" || typeof value === "string") {
      const s = String(value).slice(0, 24);
      if (s.length > 0) parts.push(`${key}: ${s}`);
    }
  }
  return parts.join(" · ");
}

function formatDateRange(from: string, to: string): string {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  return `${fmt(from)} – ${fmt(to)}`;
}
