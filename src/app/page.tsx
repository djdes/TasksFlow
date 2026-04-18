import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BellRing,
  Building2,
  CheckCircle2,
  Clock,
  Cloud,
  Gift,
  Handshake,
  HelpCircle,
  ImageIcon,
  Leaf,
  Network,
  NotebookText,
  Plug,
  Quote,
  Rocket,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Timer,
  UserCheck,
  Users,
  Wand2,
  Wrench,
} from "lucide-react";
import { db } from "@/lib/db";
import { PricingCalculator } from "@/components/public/pricing-calculator";
import { PublicFooter } from "@/components/public/public-chrome";
import { ScreenshotFan } from "@/components/public/screenshot-fan";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title:
    "WeSetup — электронные журналы СанПиН и ХАССП. Бесплатно навсегда",
  description:
    "34 электронных журнала для общепита и пищевых производств. Гигиена, температура, бракераж, уборка, дезинфекция. Автозаполнение, Telegram-бот, PDF для Роспотребнадзора. Бесплатно до 5 сотрудников.",
  alternates: { canonical: "https://wesetup.ru/" },
};

const FEATURES = [
  {
    icon: Plug,
    slug: "sync-iiko-1c",
    title: "Синхронизация с iiko / 1С",
    text: "Подтягиваем поставщиков, продукты и поступления — бракераж и входной контроль заполняются автоматически.",
  },
  {
    icon: Wand2,
    slug: "autofill",
    title: "Автозаполнение",
    text: "Гигиена, температуры, уборка — сервис подставляет значения там, где это безопасно и разрешено.",
  },
  {
    icon: Cloud,
    slug: "cloud",
    title: "Всё в облаке",
    text: "Журналы доступны из любой точки — компьютер, планшет у шефа, телефон в цехе. История сохраняется.",
  },
  {
    icon: UserCheck,
    slug: "role-access",
    title: "Доступы по ролям",
    text: "Каждый сотрудник видит только свои журналы. Управляющий видит всех и может закрыть период.",
  },
  {
    icon: BellRing,
    slug: "reminders",
    title: "Напоминания",
    text: "Почта и Telegram пишут, если до конца смены остался незаполненный журнал. Конец дня — журналы закрыты.",
  },
  {
    icon: Bell,
    slug: "alerts",
    title: "Алерты о нарушениях",
    text: "Температура вне нормы, просрочка, отклонение — уведомление ответственному в реальном времени.",
  },
  {
    icon: Leaf,
    slug: "paperless",
    title: "Без бумаги",
    text: "Не нужно покупать журналы, заводить распечатки, хранить коробки — все записи сразу в электронном виде.",
  },
  {
    icon: Timer,
    slug: "time-saving",
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
    title: "Бесплатный старт",
    text: "Регистрируетесь и сразу ведёте настоящие журналы — без пробного периода и карты. До 5 сотрудников всё бесплатно навсегда.",
  },
  {
    title: "Ведение журналов",
    text: "Смена за сменой — сервис напоминает, подставляет автозначения, хранит историю для проверок.",
  },
];

const AUDIENCE_CHIPS: string[] = [
  "Рестораны",
  "Кафе",
  "Пекарни",
  "Кондитерские",
  "Столовые",
  "Отели",
  "Фуд-корты",
  "Кейтеринг",
  "Школьные кухни",
  "Производственные цеха",
  "Тёмные кухни",
  "Сети общепита",
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
    a: "Да — бесплатный тариф действует навсегда: до 5 сотрудников все 34 журнала включены без ограничений по времени и без привязки карты. Подписку оформляете, только если нужно больше рабочих мест или автоматизация с датчиками.",
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://wesetup.ru/#org",
        name: "WeSetup",
        url: "https://wesetup.ru",
        logo: "https://wesetup.ru/icon.png",
        sameAs: ["https://t.me/wesetupbot"],
      },
      {
        "@type": "WebSite",
        "@id": "https://wesetup.ru/#website",
        url: "https://wesetup.ru",
        name: "WeSetup",
        publisher: { "@id": "https://wesetup.ru/#org" },
        inLanguage: "ru-RU",
      },
      {
        "@type": "SoftwareApplication",
        name: "WeSetup",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android",
        description:
          "Электронные журналы СанПиН и ХАССП для общепита и пищевых производств. 34 журнала, автозаполнение, Telegram-бот, PDF для Роспотребнадзора.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "RUB",
          description: "Бесплатный тариф до 5 сотрудников",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white text-[#0b1024]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* NAV */}
      <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="text-[17px] font-semibold tracking-[0.22em] text-[#0b1024]"
        >
          WESETUP
        </Link>
        <div className="flex items-center gap-2 sm:gap-6">
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
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#0b1024] px-4 text-[14px] font-medium text-white transition-colors hover:bg-[#1a1f3a]"
          >
            <span className="hidden sm:inline">Начать</span>
            <span className="sm:hidden">Начать</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </nav>

      {/* HERO — centered stack, megaplan-inspired */}
      {/* overflow-x-clip contains the tilted phones horizontally, but lets
          vertical shadows + natural-height children extend freely so they
          don't get guillotined by the section boundary. */}
      <section className="relative overflow-x-clip pb-24 sm:pb-32">
        {/* Soft ambient gradient wash */}
        <div
          className="pointer-events-none absolute inset-0 -z-0"
          aria-hidden="true"
        >
          <div className="absolute left-[10%] top-[-8%] size-[720px] rounded-full bg-[#5566f6] opacity-[0.08] blur-[140px]" />
          <div className="absolute right-[5%] top-[40%] size-[620px] rounded-full bg-[#7a5cff] opacity-[0.07] blur-[140px]" />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(11,16,36,0.10) 1px, transparent 0)",
              backgroundSize: "28px 28px",
              maskImage:
                "radial-gradient(ellipse at 50% 40%, black 30%, transparent 75%)",
            }}
          />
          {/* Smooth fade to white at both ends so the hero "breathes" into
              the page instead of cutting abruptly */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-white" />
        </div>

        <div className="relative mx-auto max-w-[1100px] px-6 pt-8 text-center sm:pt-16">
          {/* Registry badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#dcdfed] bg-white/80 px-3.5 py-1.5 text-[12px] font-medium text-[#3848c7] backdrop-blur">
            <ShieldCheck className="size-3.5" />
            В реестре отечественного ПО
            <span className="text-[#9b9fb3]">·</span>
            <span className="text-[#6f7282]">заявка №27419</span>
          </div>

          {/* Headline */}
          <h1 className="mx-auto mt-8 max-w-[980px] text-[44px] font-semibold leading-[0.98] tracking-[-0.035em] text-[#0b1024] sm:text-[72px] md:text-[88px]">
            Электронные журналы
            <br />
            <span className="relative inline-block">
              <span className="relative z-10">для вашей кухни</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-[0.08em] -z-0 h-[0.28em] bg-[#5566f6]/15"
              />
            </span>
          </h1>

          {/* Subhead */}
          <p className="mx-auto mt-7 max-w-[640px] text-[16px] leading-[1.6] text-[#3c4053] sm:text-[18px]">
            СанПиН и ХАССП в одной системе. Заполняете с планшета на кухне
            или из Telegram, PDF для Роспотребнадзора — в один клик.
            Бесплатно навсегда до 5 сотрудников.
          </p>

          {/* Single big CTA */}
          <div className="mt-10 flex flex-col items-center gap-3">
            <Link
              href="/register"
              className="group inline-flex h-[58px] items-center gap-2 rounded-full bg-[#0b1024] px-9 text-[16px] font-semibold text-white shadow-[0_20px_50px_-20px_rgba(11,16,36,0.55)] transition-all hover:-translate-y-0.5 hover:bg-[#1a1f3a] hover:shadow-[0_24px_55px_-18px_rgba(11,16,36,0.6)]"
            >
              Начать
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <div className="text-[12px] text-[#9b9fb3]">
              Без карты · Всё включено на бесплатном тарифе
            </div>
          </div>

          {/* Audience chips */}
          <div className="mx-auto mt-14 max-w-[860px]">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b9fb3]">
              Подходит для
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {AUDIENCE_CHIPS.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center rounded-full border border-[#ececf4] bg-white px-4 py-2 text-[13px] font-medium text-[#3c4053] shadow-[0_0_0_1px_rgba(240,240,250,0.45)]"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* Screenshot fan — min-h sized to the tallest child (phone
              ≈480px + shadow + top offset). h-auto lets natural height
              win so phones never clip. */}
          <div className="relative mx-auto mt-20 min-h-[540px] max-w-[1100px] sm:min-h-[620px] md:min-h-[680px]">
            <ScreenshotFan />
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
            <Link
              key={f.title}
              href={`/features/${f.slug}`}
              className="group flex flex-col rounded-2xl border border-[#ececf4] bg-white p-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] transition-all hover:-translate-y-0.5 hover:border-[#5566f6]/40 hover:shadow-[0_14px_32px_-16px_rgba(85,102,246,0.28)]"
            >
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#5566f6] transition-transform group-hover:scale-105">
                <f.icon className="size-6" />
              </div>
              <div className="text-[16px] font-semibold tracking-[-0.01em] text-[#0b1024] group-hover:text-[#3848c7]">
                {f.title}
              </div>
              <p className="mt-2 flex-1 text-[13px] leading-[1.55] text-[#6f7282]">
                {f.text}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-[#3848c7] opacity-0 transition-opacity group-hover:opacity-100">
                Подробнее
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
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
                Бесплатно навсегда. Без карты.
              </h3>
              <p className="mt-3 text-[15px] text-white/70">
                Поднимете свою организацию за 10 минут и начнёте вести
                журналы прямо сегодня. Платите, только если нужно больше
                рабочих мест или автоматизация.
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
        <div className="mb-10 max-w-[720px]">
          <div className="mb-3 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
            <Gift className="size-4" />
            Тарифы
          </div>
          <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
            Все журналы бесплатно. Платите за автоматизацию.
          </h2>
          <p className="mt-4 text-[15px] text-[#6f7282]">
            Софт-подписка — одна и та же цена. Отличаются только услуги:
            приехать, подключить датчики к холодильникам, настроить
            профили и обучить смену. Всё железо — разовая покупка.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Free tier */}
          <PricingCard
            kind="free"
            name="Бесплатный"
            from="0 ₽"
            period="навсегда"
            description="Доступ ко всем журналам без ограничений по времени. Для заведения с небольшой сменой."
            points={[
              "До 5 сотрудников",
              "Все 34 журнала СанПиН + ХАССП",
              "Telegram-бот с wizard заполнения",
              "PDF для проверок, без привязки карты",
            ]}
            ctaLabel="Начать бесплатно"
            ctaHref="/register"
          />

          {/* Subscription tier (user brings own equipment) */}
          <PricingCard
            kind="team"
            name="Подписка"
            from="1 990 ₽"
            period="в месяц"
            description="Если датчики, планшеты и брелоки уже есть — подключаем их к WeSetup и снимаем все ограничения."
            points={[
              "Без лимита по сотрудникам",
              "Подключение своих IoT-датчиков",
              "Автозаполнение температур и гигиены",
              "Приоритетная поддержка в Telegram",
            ]}
            ctaLabel="Оформить подписку"
            ctaHref="/register"
            highlighted
            badge="Популярный"
          />

          {/* Subscription + equipment bundle with live calculator */}
          <div className="relative overflow-hidden rounded-3xl border border-[#ececf4] bg-white p-6 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] md:p-7">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#5566f6]">
                <Wrench className="size-5" />
              </span>
              <div className="text-[20px] font-semibold tracking-[-0.01em] text-[#0b1024]">
                Подписка + оборудование
              </div>
            </div>
            <p className="mt-4 text-[14px] leading-[1.55] text-[#6f7282]">
              Выберите, что нужно — цена пересчитается. Уже есть планшет
              или датчики — снимите галочку, и останется только подписка.
            </p>
            <div className="mt-5">
              <PricingCalculator />
            </div>
          </div>
        </div>
        <div className="mt-4 text-center text-[13px] text-[#9b9fb3]">
          Годовая оплата подписки — −20%. Железо — один раз.
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

      {/* PARTNERSHIP */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-[#ececf4] bg-white px-8 py-10 md:px-12">
          <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-5">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#5566f6]">
                <Handshake className="size-6" />
              </div>
              <div className="max-w-[620px]">
                <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[#0b1024]">
                  Работаете с общепитом? Станьте партнёром.
                </h3>
                <p className="mt-2 text-[14px] leading-[1.55] text-[#6f7282]">
                  Консалтинг по ХАССП, интеграторы учётных систем, поставщики
                  оборудования — расскажем, как подключить ваших клиентов и
                  зарабатывать на продлениях.
                </p>
              </div>
            </div>
            <a
              href="https://t.me/wesetupbot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-5 text-[14px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
            >
              Написать в Telegram
              <ArrowRight className="size-4 text-[#5566f6]" />
            </a>
          </div>
        </div>
      </section>

      {/* MOBILE + TELEGRAM SCREENSHOTS — placeholder carousel */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="mb-10 max-w-[640px]">
          <div className="mb-3 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
            <Smartphone className="size-4" />
            Мобильный доступ
          </div>
          <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
            Журналы с планшета повара и бота в Telegram
          </h2>
          <p className="mt-4 text-[15px] text-[#6f7282]">
            Повар заполняет на планшете прямо в цехе, управляющий видит
            статус в Telegram, руководитель — полную картину на компьютере.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Smartphone,
              label: "Планшет на кухне",
              caption: "Гигиена / температура в один тап",
            },
            {
              icon: Send,
              label: "Telegram-бот",
              caption: "Напоминания и алерты о нарушениях",
            },
            {
              icon: ImageIcon,
              label: "Компьютер руководителя",
              caption: "Отчёты и PDF для Роспотребнадзора",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="group flex aspect-[3/4] flex-col items-center justify-center rounded-3xl border border-dashed border-[#dcdfed] bg-[#fafbff] p-6 text-center transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
            >
              <div className="flex size-14 items-center justify-center rounded-2xl bg-white text-[#5566f6] shadow-[0_0_0_1px_rgba(220,223,237,1)]">
                <item.icon className="size-7" />
              </div>
              <div className="mt-5 text-[15px] font-semibold text-[#0b1024]">
                {item.label}
              </div>
              <div className="mt-1 text-[13px] text-[#6f7282]">
                {item.caption}
              </div>
              <div className="mt-4 text-[11px] uppercase tracking-[0.16em] text-[#9b9fb3]">
                Скриншот скоро
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CLIENTS — placeholder logo wall */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="mb-8 text-center">
          <div className="mb-3 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
            С нами работают
          </div>
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">
            Кафе, пекарни, сетевые рестораны и цеха
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex h-20 items-center justify-center rounded-2xl border border-dashed border-[#dcdfed] bg-[#fafbff] text-[11px] uppercase tracking-[0.16em] text-[#9b9fb3]"
            >
              Логотип
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-[12px] text-[#9b9fb3]">
          Место для логотипов клиентов — добавим после согласования с ними.
        </p>
      </section>

      {/* TESTIMONIALS — placeholder */}
      <section className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="mb-10 max-w-[640px]">
          <div className="mb-3 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#5566f6]">
            <Quote className="size-4" />
            Отзывы
          </div>
          <h2 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
            Что говорят клиенты
          </h2>
          <p className="mt-3 text-[14px] text-[#9b9fb3]">
            Собираем первые отзывы — добавим сразу после письменного
            согласия клиентов.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-3xl border border-dashed border-[#dcdfed] bg-[#fafbff] p-6"
            >
              <div className="flex gap-0.5 text-[#dcdfed]">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="size-4 fill-current" />
                ))}
              </div>
              <div className="mt-5 space-y-2">
                <div className="h-3 w-full rounded-full bg-[#ececf4]" />
                <div className="h-3 w-11/12 rounded-full bg-[#ececf4]" />
                <div className="h-3 w-9/12 rounded-full bg-[#ececf4]" />
              </div>
              <div className="mt-6 flex items-center gap-3">
                <div className="size-10 rounded-full bg-[#ececf4]" />
                <div className="flex flex-col gap-1">
                  <div className="h-2.5 w-24 rounded-full bg-[#ececf4]" />
                  <div className="h-2 w-16 rounded-full bg-[#f1f2f9]" />
                </div>
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
            уже сегодня. Бесплатный тариф — без срока, без карты.
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
      <PublicFooter />
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
  badge,
}: {
  kind: "free" | "team" | "network";
  name: string;
  from: string;
  period: string;
  description: string;
  points: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
  badge?: string;
}) {
  const Icon =
    kind === "free" ? Gift : kind === "network" ? Building2 : Users;
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
          {badge && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#7cf5c0]/20 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[#7cf5c0]">
              {badge}
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
