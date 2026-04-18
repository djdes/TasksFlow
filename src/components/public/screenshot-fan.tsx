import {
  ArrowRight,
  CheckCircle2,
  FileText,
  MessageSquare,
  Snowflake,
  Send,
  Users,
} from "lucide-react";

/**
 * Three stacked/tilted mockups showing the product surfaces: a desktop
 * dashboard in the centre, a phone with the Telegram bot on the left,
 * and a phone with the PDF export on the right.
 *
 * Everything is rendered as styled divs — no external images. That
 * keeps the hero blazing fast (one more image = one more LCP hit) and
 * sidesteps the «stock photo of a chef pointing at a laptop» cliché.
 * Content is stylised miniature UI: the proportions and typography
 * read as «it's our app», not «it's a random chart».
 */
export function ScreenshotFan() {
  return (
    <div className="absolute inset-0">
      {/* DESKTOP DASHBOARD — centre, only shown sm+; hard-capped to
          container so narrow tablets don't horizontal-scroll */}
      <div className="absolute left-1/2 top-0 hidden w-[min(760px,100%)] -translate-x-1/2 sm:block">
        <DesktopMockup />
      </div>

      {/* Mobile variant — only one phone, centred; smaller width so it
          fits under the hero chips on 320px devices */}
      <div className="absolute left-1/2 top-0 block w-[min(180px,65vw)] -translate-x-1/2 sm:hidden">
        <TelegramMockup />
      </div>

      {/* TELEGRAM BOT PHONE — left, tilted -8° (sm+ only) */}
      <div className="absolute left-[2%] bottom-0 hidden w-[min(220px,22vw)] -rotate-[8deg] sm:block md:left-[6%] md:w-[240px]">
        <TelegramMockup />
      </div>

      {/* PDF PHONE — right, tilted +8° (sm+ only) */}
      <div className="absolute right-[2%] bottom-0 hidden w-[min(220px,22vw)] rotate-[8deg] sm:block md:right-[6%] md:w-[240px]">
        <PdfMockup />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------
 * Desktop dashboard mockup
 * -------------------------------------------------------------------- */

function DesktopMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#ececf4] bg-white shadow-[0_40px_80px_-30px_rgba(11,16,36,0.25),0_0_0_1px_rgba(240,240,250,0.7)]">
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-[#ececf4] bg-[#fafbff] px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff6059]" />
        <span className="size-2.5 rounded-full bg-[#ffbe2f]" />
        <span className="size-2.5 rounded-full bg-[#29d153]" />
        <div className="ml-4 flex h-6 flex-1 items-center rounded-full bg-white px-3 text-[11px] text-[#9b9fb3]">
          wesetup.ru/dashboard
        </div>
      </div>
      {/* app chrome */}
      <div className="flex items-center justify-between border-b border-[#ececf4] bg-white px-5 py-3">
        <div className="flex items-center gap-6">
          <div className="text-[13px] font-semibold tracking-[0.14em] text-[#0b1024]">
            WESETUP
          </div>
          <div className="flex gap-4 text-[12px] font-medium text-[#6f7282]">
            <span className="text-[#0b1024]">Дашборд</span>
            <span>Журналы</span>
            <span>Сотрудники</span>
            <span>Отчёты</span>
          </div>
        </div>
        <div className="flex size-7 items-center justify-center rounded-full bg-[#eef1ff] text-[10px] font-semibold text-[#3848c7]">
          ДВ
        </div>
      </div>
      {/* body */}
      <div className="grid gap-3 bg-[#fafbff] p-5 md:grid-cols-[1.2fr_1fr]">
        {/* left: journals list */}
        <div className="rounded-xl border border-[#ececf4] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-[#0b1024]">
              Сегодня незаполнено
            </div>
            <span className="rounded-full bg-[#fff4f2] px-2 py-0.5 text-[10px] font-medium text-[#a13a32]">
              3
            </span>
          </div>
          <ul className="space-y-2">
            {[
              { name: "Гигиенический журнал", time: "09:00", done: true },
              { name: "Температура холодильников", time: "10:00", done: true },
              { name: "Бракераж готовой продукции", time: "12:00", done: false },
              { name: "Уборка зала", time: "18:00", done: false },
              { name: "Учёт фритюра", time: "20:00", done: false },
            ].map((r) => (
              <li
                key={r.name}
                className="flex items-center gap-3 rounded-lg bg-[#fafbff] px-3 py-2"
              >
                <CheckCircle2
                  className={`size-3.5 shrink-0 ${
                    r.done ? "text-[#5566f6]" : "text-[#dcdfed]"
                  }`}
                />
                <span className="text-[11px] font-medium text-[#0b1024]">
                  {r.name}
                </span>
                <span className="ml-auto text-[10px] text-[#9b9fb3]">
                  {r.time}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {/* right: chart card + stat card */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-[#ececf4] bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium text-[#6f7282]">
                Холодильник №3
              </div>
              <Snowflake className="size-3.5 text-[#5566f6]" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 text-[#0b1024]">
              <span className="text-[24px] font-semibold tabular-nums">
                +2.8
              </span>
              <span className="text-[11px] text-[#9b9fb3]">°C</span>
            </div>
            {/* mini chart */}
            <svg
              viewBox="0 0 200 50"
              className="mt-2 block h-[42px] w-full"
              fill="none"
              stroke="#5566f6"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <path d="M0 30 L20 28 L40 32 L60 26 L80 30 L100 20 L120 24 L140 18 L160 22 L180 16 L200 20" />
              <path
                d="M0 30 L20 28 L40 32 L60 26 L80 30 L100 20 L120 24 L140 18 L160 22 L180 16 L200 20 L200 50 L0 50 Z"
                fill="url(#chartGrad)"
                stroke="none"
              />
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5566f6" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#5566f6" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="rounded-xl border border-[#ececf4] bg-[#0b1024] p-4 text-white">
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/60">
              CAPA открыто
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[22px] font-semibold tabular-nums">2</span>
              <span className="text-[10px] text-white/60">задачи</span>
            </div>
            <div className="mt-2 text-[11px] text-white/80">
              Температура витрины ↑ · Просрочка молочки
            </div>
          </div>
          <div className="rounded-xl border border-[#ececf4] bg-white p-4">
            <div className="flex items-center gap-2">
              <Users className="size-3.5 text-[#5566f6]" />
              <span className="text-[11px] font-medium text-[#6f7282]">
                На смене
              </span>
            </div>
            <div className="mt-1 text-[22px] font-semibold tabular-nums text-[#0b1024]">
              8
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------
 * Telegram bot phone mockup
 * -------------------------------------------------------------------- */

function TelegramMockup() {
  return (
    <div className="overflow-hidden rounded-[34px] border-[6px] border-[#0b1024] bg-[#0b1024] shadow-[0_30px_60px_-20px_rgba(11,16,36,0.4)]">
      <div className="rounded-[28px] bg-white">
        {/* header */}
        <div className="flex items-center gap-2 bg-[#4680c2] px-4 py-3 text-white">
          <div className="flex size-8 items-center justify-center rounded-full bg-white/20">
            <Send className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold">
              @wesetupbot
            </div>
            <div className="text-[10px] text-white/70">в сети</div>
          </div>
        </div>
        {/* chat */}
        <div className="space-y-2 bg-[#eef3f8] p-3">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">
            <div className="text-[11px] font-semibold text-[#0b1024]">
              📋 Журналы
            </div>
            <div className="mt-1 text-[10px] leading-[1.4] text-[#6f7282]">
              Выберите журнал для заполнения:
            </div>
            <div className="mt-2 space-y-1.5">
              {["Гигиенический журнал", "Температура холодильников", "Уборка зала"].map(
                (t) => (
                  <div
                    key={t}
                    className="rounded-lg bg-[#eef1ff] px-2 py-1.5 text-[10px] font-medium text-[#3848c7]"
                  >
                    {t}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="ml-auto max-w-[60%] rounded-2xl rounded-br-sm bg-[#5566f6] px-3 py-2 text-[10px] text-white">
            Температура холодильников
          </div>

          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] text-[#0b1024]">
              Холодильник №3 — введите значение температуры:
            </div>
          </div>

          <div className="ml-auto max-w-[40%] rounded-2xl rounded-br-sm bg-[#5566f6] px-3 py-2 text-[10px] text-white">
            +2.8
          </div>

          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">
            <div className="text-[10px] font-medium text-[#116b2a]">
              ✅ Запись сохранена
            </div>
            <div className="mt-0.5 text-[10px] text-[#6f7282]">
              Видна на сайте мгновенно
            </div>
          </div>
        </div>
        {/* input */}
        <div className="flex items-center gap-2 border-t border-[#ececf4] bg-white px-3 py-2">
          <div className="flex-1 rounded-full bg-[#f5f6ff] px-3 py-1.5 text-[10px] text-[#9b9fb3]">
            Написать...
          </div>
          <div className="flex size-6 items-center justify-center rounded-full bg-[#5566f6]">
            <MessageSquare className="size-3 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------
 * PDF export phone mockup
 * -------------------------------------------------------------------- */

function PdfMockup() {
  return (
    <div className="overflow-hidden rounded-[34px] border-[6px] border-[#0b1024] bg-[#0b1024] shadow-[0_30px_60px_-20px_rgba(11,16,36,0.4)]">
      <div className="rounded-[28px] bg-[#fafbff]">
        {/* header */}
        <div className="flex items-center justify-between bg-white px-4 py-3">
          <div className="text-[11px] font-semibold tracking-[0.1em] text-[#0b1024]">
            WESETUP
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[9px] font-medium text-[#116b2a]">
            <FileText className="size-3" />
            PDF
          </div>
        </div>
        {/* paper */}
        <div className="p-3">
          <div className="rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(220,223,237,0.8)]">
            <div className="text-[10px] font-semibold text-[#0b1024]">
              Гигиенический журнал
            </div>
            <div className="mt-0.5 text-[9px] text-[#6f7282]">
              Период: 01.04 — 15.04.2026
            </div>

            <div className="mt-2 space-y-1">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md bg-[#fafbff] px-2 py-1.5 text-[9px]">
                <span className="font-medium text-[#0b1024]">
                  Волков Д.В.
                </span>
                <span className="text-[#6f7282]">15.04</span>
                <span className="inline-flex size-3 items-center justify-center rounded-full bg-[#5566f6] text-[7px] text-white">
                  ✓
                </span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md bg-[#fafbff] px-2 py-1.5 text-[9px]">
                <span className="font-medium text-[#0b1024]">
                  Петрова Н.А.
                </span>
                <span className="text-[#6f7282]">15.04</span>
                <span className="inline-flex size-3 items-center justify-center rounded-full bg-[#5566f6] text-[7px] text-white">
                  ✓
                </span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md bg-[#fff4f2] px-2 py-1.5 text-[9px]">
                <span className="font-medium text-[#0b1024]">
                  Соколов А.М.
                </span>
                <span className="text-[#6f7282]">15.04</span>
                <span className="inline-flex size-3 items-center justify-center rounded-full bg-[#d2453d] text-[7px] text-white">
                  !
                </span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md bg-[#fafbff] px-2 py-1.5 text-[9px]">
                <span className="font-medium text-[#0b1024]">
                  Иванова Е.П.
                </span>
                <span className="text-[#6f7282]">15.04</span>
                <span className="inline-flex size-3 items-center justify-center rounded-full bg-[#5566f6] text-[7px] text-white">
                  ✓
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-dashed border-[#dcdfed] pt-2 text-[8px] text-[#9b9fb3]">
              <span>стр. 1 из 12</span>
              <span>подпись: ________</span>
            </div>
          </div>
        </div>
        {/* action */}
        <div className="flex items-center gap-2 px-4 pb-4 pt-1">
          <div className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-full bg-[#0b1024] text-[10px] font-medium text-white">
            Скачать для проверки
            <ArrowRight className="size-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
