"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Gauge,
  Package,
  Smartphone,
  Thermometer,
  UserCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Third-tier calculator: customer toggles which devices + setup they
 * need. Subscription is fixed; hardware + on-site install are a
 * one-time sum that updates live.
 *
 * Stays a client component because every change to the device picker
 * re-computes the totals without a round trip.
 */

type DeviceOption = {
  id: string;
  title: string;
  icon: LucideIcon;
  price: number;
  /// "per-unit" lets the customer choose quantity; "flat" is a single
  /// checkbox (install / setup fee).
  mode: "per-unit" | "flat";
  hint?: string;
  defaultQty?: number;
};

const SUBSCRIPTION_MONTHLY = 1990;

const DEVICES: DeviceOption[] = [
  {
    id: "install",
    title: "Выездной монтаж и настройка",
    icon: Wrench,
    price: 9900,
    mode: "flat",
    hint: "Инженер приезжает на кухню, устанавливает датчики, настраивает профили и проводит обучение смены.",
    defaultQty: 1,
  },
  {
    id: "temp",
    title: "Датчик температуры",
    icon: Thermometer,
    price: 3490,
    mode: "per-unit",
    hint: "Для холодильной или морозильной камеры — одна штука на одно оборудование.",
    defaultQty: 2,
  },
  {
    id: "thermo",
    title: "Термогигрометр",
    icon: Gauge,
    price: 2890,
    mode: "per-unit",
    hint: "Для контроля температуры и влажности в зале / цеху.",
    defaultQty: 1,
  },
  {
    id: "tablet",
    title: "Планшет для кухни",
    icon: Smartphone,
    price: 12900,
    mode: "per-unit",
    hint: "10 дюймов, защитный чехол, предустановленный профиль. Клеится к стене в цехе.",
    defaultQty: 1,
  },
  {
    id: "nfc",
    title: "NFC-брелоки",
    icon: UserCheck,
    price: 490,
    mode: "per-unit",
    hint: "Вход в журналы одним тапом — по одному на активную смену.",
    defaultQty: 5,
  },
];

function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}

export function PricingCalculator() {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(DEVICES.map((d) => [d.id, d.defaultQty ?? 0]))
  );

  const setQty = (id: string, qty: number) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, qty) }));

  const oneTime = useMemo(
    () =>
      DEVICES.reduce((sum, d) => sum + d.price * (quantities[d.id] ?? 0), 0),
    [quantities]
  );

  const activeDevices = DEVICES.filter((d) => (quantities[d.id] ?? 0) > 0)
    .length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#7cf5c0]/20 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#116b2a]">
          <Package className="size-3.5" />
          С оборудованием
        </span>
        <span className="text-[13px] text-[#6f7282]">
          Подписка та же, добавляются разовые позиции
        </span>
      </div>

      {/* DEVICE PICKER */}
      <div className="space-y-2.5">
        {DEVICES.map((d) => {
          const qty = quantities[d.id] ?? 0;
          const active = qty > 0;
          return (
            <div
              key={d.id}
              className={`group rounded-2xl border px-4 py-3 transition-colors ${
                active
                  ? "border-[#5566f6]/40 bg-[#f5f6ff]"
                  : "border-[#ececf4] bg-[#fafbff]"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setQty(
                      d.id,
                      active ? 0 : d.defaultQty ?? (d.mode === "flat" ? 1 : 1)
                    )
                  }
                  aria-pressed={active}
                  aria-label={`Переключить ${d.title}`}
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    active
                      ? "border-[#5566f6] bg-[#5566f6] text-white"
                      : "border-[#dcdfed] bg-white"
                  }`}
                >
                  {active && <Check className="size-3" strokeWidth={3} />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <d.icon className="size-4 text-[#5566f6]" />
                    <span className="text-[14px] font-medium text-[#0b1024]">
                      {d.title}
                    </span>
                    <span className="ml-auto whitespace-nowrap text-[13px] font-semibold text-[#0b1024]">
                      {formatRub(d.price)}
                      {d.mode === "per-unit" && (
                        <span className="text-[11px] font-normal text-[#9b9fb3]">
                          {" "}
                          × шт
                        </span>
                      )}
                    </span>
                  </div>
                  {d.hint && (
                    <p className="mt-1 text-[12px] leading-[1.5] text-[#6f7282]">
                      {d.hint}
                    </p>
                  )}
                  {active && d.mode === "per-unit" && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#dcdfed] bg-white p-1">
                      <button
                        type="button"
                        aria-label="Убрать одну штуку"
                        onClick={() => setQty(d.id, qty - 1)}
                        className="flex size-7 items-center justify-center rounded-lg text-[#6f7282] transition-colors hover:bg-[#f5f6ff] hover:text-[#0b1024]"
                      >
                        −
                      </button>
                      <span className="min-w-[24px] text-center text-[14px] font-semibold tabular-nums text-[#0b1024]">
                        {qty}
                      </span>
                      <button
                        type="button"
                        aria-label="Добавить одну штуку"
                        onClick={() => setQty(d.id, qty + 1)}
                        className="flex size-7 items-center justify-center rounded-lg text-[#6f7282] transition-colors hover:bg-[#f5f6ff] hover:text-[#0b1024]"
                      >
                        +
                      </button>
                      <span className="pr-2 text-[11px] text-[#9b9fb3]">
                        = {formatRub(d.price * qty)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* TOTALS */}
      <div className="rounded-2xl bg-[#0b1024] p-5 text-white">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[12px] uppercase tracking-[0.14em] text-white/60">
            Подписка
          </div>
          <div className="text-right">
            <span className="text-[22px] font-semibold tracking-[-0.01em]">
              {formatRub(SUBSCRIPTION_MONTHLY)}
            </span>
            <span className="ml-1 text-[12px] text-white/60">/мес</span>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <div className="text-[12px] uppercase tracking-[0.14em] text-white/60">
            Единоразово
          </div>
          <div className="text-right">
            <span className="text-[22px] font-semibold tracking-[-0.01em]">
              {formatRub(oneTime)}
            </span>
            <span className="ml-1 text-[12px] text-white/60">
              {activeDevices > 0
                ? `· ${activeDevices} ${plural(activeDevices, "позиция", "позиции", "позиций")}`
                : "пусто"}
            </span>
          </div>
        </div>
      </div>

      <a
        href="https://t.me/wesetupbot"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0]"
      >
        Оформить в Telegram
        <ArrowRight className="size-4" />
      </a>
      <p className="-mt-1 text-center text-[12px] text-[#9b9fb3]">
        Привозим и ставим в течение 3 рабочих дней по Москве и области.
      </p>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
