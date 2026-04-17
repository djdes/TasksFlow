import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BellRing,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  Cloud,
  Flame,
  HelpCircle,
  Leaf,
  Network,
  NotebookText,
  Plug,
  Rocket,
  ShieldCheck,
  Sparkles,
  Store,
  Timer,
  UserCheck,
  Users,
  Wand2,
} from "lucide-react";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FEATURES = [
  {
    icon: Plug,
    title: "Синхронизация с iiko / 1С",
    text: "Подтягиваем поставщиков, продукты и поступления — бракераж и входной контроль заполняются автоматически.",
  },
  {
    icon: Wand2,
    title: "Автозаполнение",
    text: "Гигиена, температуры, уборка — сервис подставляет значения там, где это безопасно и разрешено.",
  },
  {
    icon: Cloud,
    title: "Всё в облаке",
    text: "Журналы доступны из любой точки — компьютер, планшет у шефа, телефон в цехе. История сохраняется.",
  },
  {
    icon: UserCheck,
    title: "Доступы по ролям",
    text: "Каждый сотрудник видит только свои журналы. Управляющий видит всех и может закрыть период.",
  },
  {
    icon: BellRing,
    title: "Напоминания",
    text: "Почта и Telegram пишут, если до конца смены остался незаполненный журнал. Конец дня — журналы закрыты.",
  },
  {
    icon: Bell,
    title: "Алерты о нарушениях",
    text: "Температура вне нормы, просрочка, отклонение — уведомление ответственному в реальном времени.",
  },
  {
    icon: Leaf,
    title: "Без бумаги",
    text: "Не нужно покупать журналы, заводить распечатки, хранить коробки — все записи сразу в электронном виде.",
  },
  {
    icon: Timer,
    title: "Экономия времени",
    text: "5–10 минут на заполнение всех журналов в конце смены вместо часа возни с бумагой и пастами.",
  },
];

const JOURNAL_PREVIEW: Array<{ code: string; name: string }> = [
  { code: "hygiene", name: "Гигиенический журнал" },
  { code: "health_check", name: "Журнал здоровья (ЗОЖ)" },
  { code: "climate_control", name: "Контроль температуры и влажности" },
  { code: "cleaning", name: "Журнал уборки помещений" },
  { code: "uv_lamp_runtime", name: "Работа УФ-бактерицидной установки" },
  { code: "finished_product", name: "Бракераж готовой продукции" },
  { code: "fryer_oil", name: "Учёт фритюрных жиров" },
  { code: "cold_equipment_control", name: "Температура холодильного оборудования" },
  { code: "cleaning_ventilation_checklist", name: "Чек-лист проветривания" },
  { code: "general_cleaning", name: "График генеральных уборок" },
  { code: "incoming_control", name: "Приёмка и входной контроль сырья" },
  { code: "med_books", name: "Медицинские книжки" },
];

const STEPS = [
  {
    title: "Оставьте заявку",
    text: "Напишите нам в Telegram или через форму — уточним формат и количество заведений.",
  },
  {
    title: "Первичный созвон",
    text: "Покажем систему, ответим на вопросы, обсудим тариф и план перехода.",
  },
  {
    title: "Демо-доступ",
    text: "14 дней бесплатно — реальные журналы на ваших сотрудниках и помещениях, без рисков.",
  },
  {
    title: "Ведение журналов",
    text: "Смена за сменой — сервис напоминает, подставляет автозначения, хранит историю для проверок.",
  },
];

const AUDIENCE = [
  {
    icon: Store,
    title: "Одно или несколько заведений",
    text: "Кафе, ресторан, столовая — один владелец видит все точки в одном окне.",
  },
  {
    icon: Network,
    title: "Сетевые и производственные площадки",
    text: "Единые шаблоны на все филиалы, понятный периметр проверок Роспотребнадзора.",
  },
  {
    icon: Building2,
    title: "Объединения рестораторов",
    text: "Общий доступ к корпоративным настройкам и централизованная отчётность.",
  },
  {
    icon: Users,
    title: "Консалтинг по ХАССП / HoReCa",
    text: "Приводите клиентов в готовую инфраструктуру, закрывайте проекты быстрее.",
  },
  {
    icon: Rocket,
    title: "IT-компании",
    text: "Интегрируетесь в наш API, добавляете электронные журналы как модуль вашей экосистемы.",
  },
];

const FAQ = [
  {
    q: "Что такое электронный журнал для общепита?",
    a: "Веб-сервис, куда сотрудники вносят те же записи, что раньше делали в бумажных журналах — гигиена, температура, бракераж и так далее. С 1 января 2021 года такой формат разрешён СанПиН 2.3/2.4.3590-20.",
  },
  {
    q: "Как проходит проверка Роспотребнадзором?",
    a: "Инспектору выгружается PDF со всеми записями за запрошенный период. Формат печати соответствует требованиям: ФИО, должность, электронная подпись, дата и ключевые значения.",
  },
  {
    q: "Есть ли синхронизация с iiko и 1С?",
    a: "Да. Поставщики, продукты, поступления и бракераж подтягиваются автоматически, чтобы руками вбивать не приходилось. Настройка — около 30 минут вместе с нашим инженером.",
  },
  {
    q: "Где указано, что можно вести журналы в электронном виде?",
    a: "СанПиН 2.3/2.4.3590-20 «Санитарно-эпидемиологические требования к организации общественного питания населения», действует с 1 января 2021 года. Электронная форма прямо разрешена.",
  },
  {
    q: "Можно попробовать бесплатно?",
    a: "Да — 14 дней демо-доступа со всеми функциями, без привязки карты. Если не подойдёт, просто не оформляете подписку.",
  },
];

export default async function LandingPage() {
  const latestArticles = await db.article.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 3,
    select: {
      slug: true,
      title: true,
      excerpt: true,
      tags: true,
      readMinutes: true,
      publishedAt: true,
    },
  });

  return (
    <div className="min-h-screen bg-white text-[#0b1024]">
      {/* NAV */}
      <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[18px] font-semibold tracking-tight"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#5566f6] text-white ring-1 ring-white/20">
            <ShieldCheck className="size-5" />
          </span>
          <span className="text-[#0b1024]">WeSetup</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-5">
          <Link
            href="/journals-info"
            className="hidden text-[14px] font-medium text-[#6f7282] transition-colors hover:text-[#0b1024] sm:inline"
          >
            Журналы
          </Link>
          <Link
            href="/blog"
            className="hidden text-[14px] font-medium text-[#6f7282] transition-colors hover:text-[#0b1024] sm:inline"
          >
            Блог
          </Link>
          <Link
            href="/login"
            className="hidden h-10 items-center rounded-2xl border border-[#dcdfed] bg-white px-4 text-[14px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff] sm:inline-flex"
          >
            Войти
          </Link>
          <Link
            href="/register"
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#5566f6] px-4 text-[14px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0]"
          >
            <span className="hidden sm:inline">Попробовать бесплатно</span>
            <span className="sm:hidden">Попробовать</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="mx-auto max-w-[1200px] px-6">
        <div className="relative overflow-hidden rounded-3xl bg-[#0b1024] px-6 py-16 text-white md:px-12 md:py-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 size-[520px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
            <div className="absolute -bottom-40 -right-32 size-[560px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
            <div className="absolute left-1/3 top-1/2 size-[340px] rounded-full bg-[#3d4efc] opacity-30 blur-[100px]" />
          </div>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage:
                "radial-gradient(ellipse at 40% 40%, black 40%, transparent 70%)",
            }}
          />
          <div className="relative z-10 max-w-[720px]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] uppercase tracking-[0.18em] text-white/70 backdrop-blur">
              <span className="size-1.5 rounded-full bg-[#7cf5c0]" />
              СанПиН 2.3/2.4.3590-20 · 35 журналов
            </div>
            <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
              Электронные журналы
              <br />
              для общепита и производства
            </h1>
            <p className="mt-6 max-w-[540px] text-[17px] leading-[1.55] text-white/75">
              WeSetup переносит бумажные журналы Роспотребнадзора и ХАССП в
              браузер: автозаполнение, напоминания, уведомления о нарушениях,
              готовый PDF для проверок.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#5566f6] px-6 text-[15px] font-medium text-white shadow-[0_12px_36px_-12px_rgba(85,102,246,0.65)] transition-colors hover:bg-[#4a5bf0]"
              >
                Попробовать 14 дней бесплатно
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="https://t.me/wesetupbot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 text-[15px] font-medium text-white backdrop-blur transition-colors hover:bg-white/10"
              >
                Написать в Telegram
                <ArrowRight className="size-4" />
              </a>
            </div>

            <ul className="mt-10 grid max-w-[520px] grid-cols-1 gap-x-6 gap-y-3 text-[14px] text-white/80 sm:grid-cols-2">
              {[
                "35 журналов СанПиН / ХАССП",
                "Синхронизация с iiko и 1С",
                "Напоминания в Telegram",
                "PDF для Роспотребнадзора",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-[#7cf5c0]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mb-12 max-w-[720px]">
          <div className="mb-3 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
            Что внутри
          </div>
          <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
            Всё, что нужно, чтобы журналы действительно вели — а не «для галочки»
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] transition-all hover:-translate-y-0.5 hover:border-[#d6d9ee] hover:shadow-[0_12px_28px_-16px_rgba(85,102,246,0.22)]"
            >
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#5566f6] transition-transform group-hover:scale-105">
                <f.icon className="size-6" />
              </div>
              <div className="text-[16px] font-semibold tracking-[-0.01em] text-[#0b1024]">
                {f.title}
              </div>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#6f7282]">
                {f.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* TRIAL BANNER */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-[#0b1024] px-8 py-14 text-white md:px-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 right-0 size-[400px] rounded-full bg-[#7cf5c0] opacity-20 blur-[120px]" />
            <div className="absolute -bottom-24 -left-10 size-[420px] rounded-full bg-[#5566f6] opacity-30 blur-[120px]" />
          </div>
          <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-[560px]">
              <h3 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">
                14 дней бесплатно. Без карты.
              </h3>
              <p className="mt-3 text-[15px] text-white/70">
                Поднимете свою организацию за 10 минут, добавите сотрудников и
                начнёте вести журналы прямо сегодня. Не подойдёт — ничего не
                платите.
              </p>
            </div>
            <Link
              href="/register"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-6 text-[15px] font-medium text-[#0b1024] transition-colors hover:bg-white/90"
            >
              Попробовать
              <ArrowRight className="size-4 text-[#5566f6]" />
            </Link>
          </div>
        </div>
      </section>

      {/* JOURNALS CATALOG */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-[640px]">
            <div className="mb-3 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
              35 журналов
            </div>
            <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
              Какие журналы уже внутри
            </h2>
            <p className="mt-4 text-[15px] text-[#6f7282]">
              Базовый тариф покрывает ежедневные санитарные журналы. Расширенный
              добавляет ХАССП: аудиты, обучение, поверки, прослеживаемость,
              обслуживание оборудования, жалобы, СИЗ.
            </p>
          </div>
          <Link
            href="/journals-info"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[14px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
          >
            Смотреть весь список
            <ArrowRight className="size-4 text-[#5566f6]" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {JOURNAL_PREVIEW.map((j, idx) => (
            <Link
              key={j.code}
              href={`/journals-info/${j.code}`}
              className="group flex items-center gap-3 rounded-2xl border border-[#ececf4] bg-white px-4 py-3 text-[14px] font-medium text-[#0b1024] shadow-[0_0_0_1px_rgba(240,240,250,0.45)] transition-all hover:-translate-y-0.5 hover:border-[#5566f6]/40 hover:shadow-[0_12px_28px_-16px_rgba(85,102,246,0.22)]"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#f5f6ff] text-[12px] font-semibold text-[#5566f6]">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 truncate group-hover:text-[#3848c7]">
                {j.name}
              </span>
              <ArrowRight className="size-4 shrink-0 text-[#5566f6] opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="mb-10 max-w-[640px]">
          <div className="mb-3 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
            Тарифы
          </div>
          <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
            Два понятных плана, без скрытых доплат
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <PricingCard
            kind="basic"
            name="Базовый"
            from="от 1400 ₽"
            period="в месяц"
            description="Ежедневные журналы санитарной безопасности и ХАССП — гигиена, температуры, уборки, приёмка, бракераж, фритюр, медкнижки."
            points={[
              "13 журналов СанПиН",
              "Автозаполнение гигиены",
              "Синхронизация iiko / 1С",
              "Telegram-уведомления",
            ]}
            ctaLabel="Попробовать"
            ctaHref="/register"
          />
          <PricingCard
            kind="extended"
            name="Расширенный"
            from="от 1750 ₽"
            period="в месяц"
            description="Всё из Базового плюс обучение, аудиты, поверки, прослеживаемость, обслуживание оборудования, учёт жалоб и СИЗ."
            points={[
              "35 журналов СанПиН + ХАССП",
              "Все модули Базового тарифа",
              "Обучение персонала и план аудитов",
              "Подключение IoT-датчиков",
            ]}
            ctaLabel="Записаться на демо"
            ctaHref="https://t.me/wesetupbot"
            highlighted
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="mb-10 max-w-[640px]">
          <div className="mb-3 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
            Как подключиться
          </div>
          <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
            Переход на электронный журнал — полдня работы
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, idx) => (
            <div
              key={step.title}
              className="relative rounded-2xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-[#5566f6] text-[13px] font-semibold text-white">
                  {idx + 1}
                </span>
                <span className="text-[15px] font-semibold text-[#0b1024]">
                  {step.title}
                </span>
              </div>
              <p className="text-[13px] leading-[1.55] text-[#6f7282]">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* AUDIENCE */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="mb-10 max-w-[640px]">
          <div className="mb-3 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
            Кому полезно
          </div>
          <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
            WeSetup подойдёт, если у вас…
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {AUDIENCE.map((a) => (
            <div
              key={a.title}
              className="flex items-start gap-4 rounded-2xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#5566f6]">
                <a.icon className="size-5" />
              </div>
              <div>
                <div className="text-[15px] font-semibold leading-tight text-[#0b1024]">
                  {a.title}
                </div>
                <p className="mt-1 text-[13px] leading-[1.55] text-[#6f7282]">
                  {a.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BLOG */}
      {latestArticles.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-6 pb-20">
          <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-[640px]">
              <div className="mb-3 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
                <NotebookText className="size-4" />
                Блог
              </div>
              <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
                Как вести журналы и проходить проверки
              </h2>
              <p className="mt-4 text-[15px] text-[#6f7282]">
                Разборы норм, чек-листы и истории клиентов. Короткие тексты —
                читать можно в перерыве между заготовками.
              </p>
            </div>
            <Link
              href="/blog"
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[14px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
            >
              Все статьи
              <ArrowRight className="size-4 text-[#5566f6]" />
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {latestArticles.map((a) => (
              <Link
                key={a.slug}
                href={`/blog/${a.slug}`}
                className="group flex flex-col rounded-3xl border border-[#ececf4] bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-[#5566f6]/40 hover:shadow-[0_20px_50px_-30px_rgba(85,102,246,0.35)]"
              >
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#6f7282]">
                  {a.tags.slice(0, 2).map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-[#f5f6ff] px-2.5 py-1 text-[#3848c7]"
                    >
                      {t}
                    </span>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1">
                    <Clock className="size-3.5" /> {a.readMinutes} мин
                  </span>
                </div>
                <h3 className="mt-4 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[#0b1024] group-hover:text-[#3848c7]">
                  {a.title}
                </h3>
                <p className="mt-3 line-clamp-3 flex-1 text-[14px] leading-[1.6] text-[#6f7282]">
                  {a.excerpt}
                </p>
                <span className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-[#3848c7]">
                  Читать
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="mb-10 max-w-[640px]">
          <div className="mb-3 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
            <HelpCircle className="size-4" />
            Вопросы и ответы
          </div>
          <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
            Быстрая справка перед регистрацией
          </h2>
        </div>
        <div className="divide-y divide-[#ececf4] overflow-hidden rounded-2xl border border-[#ececf4] bg-white shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
          {FAQ.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-[16px] font-medium text-[#0b1024] hover:bg-[#fafbff]">
                <span>{item.q}</span>
                <span className="flex size-7 items-center justify-center rounded-full bg-[#f5f6ff] text-[#5566f6] transition-transform group-open:rotate-45">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <div className="px-5 pb-5 text-[14px] leading-[1.6] text-[#6f7282]">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="rounded-3xl border border-[#ececf4] bg-[#f5f6ff] p-10 text-center md:p-14">
          <div className="mx-auto mb-5 inline-flex size-14 items-center justify-center rounded-2xl bg-[#5566f6] text-white shadow-[0_14px_36px_-14px_rgba(85,102,246,0.6)]">
            <Sparkles className="size-7" />
          </div>
          <h3 className="text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[#0b1024]">
            Готовы избавиться от бумаги?
          </h3>
          <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-[1.55] text-[#6f7282]">
            Зарегистрируйте организацию за 3 шага и начните заполнять журналы
            уже сегодня. Демо-период — 14 дней, без карты.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#5566f6] px-6 text-[15px] font-medium text-white shadow-[0_12px_36px_-12px_rgba(85,102,246,0.65)] transition-colors hover:bg-[#4a5bf0]"
            >
              Зарегистрировать организацию
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-6 text-[15px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-white"
            >
              У меня уже есть аккаунт
              <ArrowRight className="size-4 text-[#5566f6]" />
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#ececf4]">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-6 py-10 md:grid-cols-[1fr_auto]">
          <div>
            <div className="inline-flex items-center gap-2 text-[16px] font-semibold">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#5566f6] text-white">
                <ShieldCheck className="size-4" />
              </span>
              WeSetup
            </div>
            <p className="mt-3 max-w-[480px] text-[13px] text-[#9b9fb3]">
              Сервис электронных журналов СанПиН и ХАССП для общепита и пищевых
              производств. © 2026 WeSetup.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#6f7282]">
            <Link href="/login" className="hover:text-[#0b1024]">
              Войти
            </Link>
            <Link href="/register" className="hover:text-[#0b1024]">
              Регистрация
            </Link>
            <a
              href="https://t.me/wesetupbot"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#0b1024]"
            >
              Telegram
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PricingCard({
  kind,
  name,
  from,
  period,
  description,
  points,
  ctaLabel,
  ctaHref,
  highlighted,
}: {
  kind: "basic" | "extended";
  name: string;
  from: string;
  period: string;
  description: string;
  points: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
}) {
  const Icon = kind === "extended" ? Flame : ClipboardList;
  return (
    <div
      className={
        highlighted
          ? "relative overflow-hidden rounded-3xl bg-[#0b1024] p-8 text-white shadow-[0_20px_60px_-30px_rgba(11,16,36,0.55)]"
          : "relative rounded-3xl border border-[#ececf4] bg-white p-8 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]"
      }
    >
      {highlighted && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 -top-16 size-[260px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -left-16 -bottom-10 size-[240px] rounded-full bg-[#7a5cff] opacity-30 blur-[120px]" />
        </div>
      )}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <span
            className={
              highlighted
                ? "flex size-11 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20"
                : "flex size-11 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#5566f6]"
            }
          >
            <Icon className="size-5" />
          </span>
          <div className="text-[20px] font-semibold tracking-[-0.01em]">
            {name}
          </div>
          {highlighted && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#7cf5c0]/20 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[#7cf5c0]">
              ХАССП
            </span>
          )}
        </div>
        <p
          className={
            highlighted
              ? "mt-4 text-[14px] leading-[1.55] text-white/70"
              : "mt-4 text-[14px] leading-[1.55] text-[#6f7282]"
          }
        >
          {description}
        </p>
        <div className="mt-6 flex items-baseline gap-2">
          <span className="text-[34px] font-semibold tracking-[-0.02em]">
            {from}
          </span>
          <span
            className={
              highlighted
                ? "text-[13px] text-white/60"
                : "text-[13px] text-[#9b9fb3]"
            }
          >
            {period}
          </span>
        </div>
        <ul
          className={
            highlighted
              ? "mt-6 space-y-2.5 text-[14px] text-white/85"
              : "mt-6 space-y-2.5 text-[14px] text-[#3c4053]"
          }
        >
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <CheckCircle2
                className={
                  highlighted
                    ? "mt-0.5 size-4 shrink-0 text-[#7cf5c0]"
                    : "mt-0.5 size-4 shrink-0 text-[#5566f6]"
                }
              />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <Link
          href={ctaHref}
          className={
            highlighted
              ? "mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-medium text-[#0b1024] transition-colors hover:bg-white/90"
              : "mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#5566f6] text-[15px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0]"
          }
        >
          {ctaLabel}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
