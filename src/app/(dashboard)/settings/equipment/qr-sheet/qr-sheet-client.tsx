"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

type Item = {
  id: string;
  name: string;
  areaName: string;
  tempMin: number | null;
  tempMax: number | null;
  url: string;
  svg: string;
};

export function QrSheetClient({
  items,
  origin,
}: {
  items: Item[];
  origin: string;
}) {
  function rangeLabel(it: Item): string {
    if (it.tempMin != null && it.tempMax != null)
      return `${it.tempMin}…${it.tempMax} °C`;
    if (it.tempMin != null) return `от ${it.tempMin} °C`;
    if (it.tempMax != null) return `до ${it.tempMax} °C`;
    return "";
  }

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link
            href="/settings/equipment"
            className="inline-flex items-center gap-1 text-[13px] text-[#6f7282] hover:text-[#0b1024]"
          >
            <ArrowLeft className="size-4" />
            К списку оборудования
          </Link>
          <h1 className="mt-2 text-[clamp(1.625rem,1.5vw+1.2rem,2rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
            QR-коды для оборудования
          </h1>
          <p className="mt-1.5 text-[13px] text-[#6f7282]">
            Один QR на единицу оборудования. Распечатайте, разрежьте и
            наклейте. Сотрудник сканирует → вводит температуру →{" "}
            <b>готово</b>, без входа в систему. Срок действия 60 дней —
            обновите страницу, чтобы перегенерировать коды.
          </p>
          <p className="mt-1 text-[12px] text-[#9b9fb3]">
            Домен для ссылок: {origin.replace(/^https?:\/\//, "")}. Чтобы
            подменить для тестов, добавьте ?origin=https://… в URL.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] hover:bg-[#4a5bf0]"
        >
          <Printer className="size-4" />
          Распечатать
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#dcdfed] bg-[#fafbff] p-10 text-center">
          <p className="text-[15px] font-medium text-[#0b1024]">
            Оборудования пока нет
          </p>
          <p className="mt-1 text-[13px] text-[#6f7282]">
            Добавьте первое в{" "}
            <Link href="/settings/equipment" className="text-[#5566f6]">
              Настройки · Оборудование
            </Link>
            , чтобы сгенерировать QR-коды.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 print:grid-cols-3 sm:grid-cols-2 md:grid-cols-3">
          {items.map((it) => (
            <article
              key={it.id}
              className="break-inside-avoid rounded-2xl border border-[#ececf4] bg-white p-5 text-center shadow-[0_0_0_1px_rgba(240,240,250,0.45)] print:shadow-none print:border-[#0b1024]/40"
            >
              <div
                className="mx-auto flex size-[180px] items-center justify-center rounded-xl border border-[#ececf4] bg-white p-2 print:border-[#0b1024]/40"
                // SVG is server-generated — safe to inline.
                dangerouslySetInnerHTML={{ __html: it.svg }}
              />
              <div className="mt-3 text-[15px] font-semibold text-[#0b1024]">
                {it.name}
              </div>
              <div className="mt-0.5 text-[12px] text-[#6f7282]">
                {it.areaName}
              </div>
              {rangeLabel(it) ? (
                <div className="mt-1 text-[12px] font-medium text-[#3848c7]">
                  Норма: {rangeLabel(it)}
                </div>
              ) : null}
              <div className="mt-3 text-[10px] text-[#9b9fb3] print:text-[#0b1024]/70">
                Сканируйте камерой телефона
              </div>
            </article>
          ))}
        </div>
      )}

      <style>{`
        @media print {
          body { background: white; }
          header, nav, footer, .screen-only { display: none !important; }
          main { padding: 0 !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
