import { Check, CheckCircle2, ArrowRight, Sparkles, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Nav } from "../components/Nav";
import { useSite } from "../site";
import { goToStart } from "../landing/start";
import { Footer } from "../components/Footer";
import { ArticleCard } from "../components/ArticleCard";
import { ContentBanner } from "../components/ContentBanner";
import { AuthForm } from "../landing/auth";
import { HeroDemo } from "../landing/HeroDemo";
import { IndustryMarquee } from "../landing/IndustryMarquee";
import { StepsShowcase } from "../landing/StepsShowcase";
import { FeatureBento } from "../landing/FeatureBento";
import { CompareSlider } from "../landing/CompareSlider";
import type { LandingData } from "../types";
import { PLAN_FEATURES, PLANS, type PlanId } from "@shared/plans";
import { DEFAULT_PRICES, formatRub, monthlyRate, type PlanPrice } from "@shared/billing";

const BEFORE = [
  "Задачи теряются в чатах и на словах",
  "«Сделал» — без доказательств",
  "Рутину забывают делать",
  "Не видно, кто отстаёт",
];
const AFTER = [
  "Все задачи — в одном списке",
  "Фото подтверждает выполнение",
  "Повторяющиеся ставятся сами",
  "Видно каждого в реальном времени",
];

type PricingCard = {
  id: PlanId;
  name: string;
  price: string;
  note: string;
  features: readonly string[];
  cta: string;
  /** "start" — к форме входа в hero, "mail" — письмо в поддержку. */
  action: "start" | "mail";
  highlight: boolean;
};

/**
 * Карточки тарифов. Цены — те же, что на странице оплаты (root правит их
 * в «Компании → Цены»); у тарифа без цены — «по запросу» и письмо нам.
 */
function pricingCards(prices: readonly PlanPrice[]): PricingCard[] {
  const paid = (id: "team" | "business", fallbackNote: string, highlight: boolean): PricingCard => {
    const rate = monthlyRate(prices, id);
    return {
      id,
      name: PLANS[id].name,
      price: rate !== null ? formatRub(Math.round(rate)) : "по запросу",
      note: rate !== null ? "в месяц" : fallbackNote,
      features: PLAN_FEATURES[id],
      cta: rate !== null ? "Попробовать" : "Обсудить",
      action: rate !== null ? "start" : "mail",
      highlight,
    };
  };
  return [
    { id: "start", name: PLANS.start.name, price: "0 ₽", note: "навсегда", features: PLAN_FEATURES.start, cta: "Начать бесплатно", action: "start", highlight: false },
    paid("team", "для команды до 30 человек", true),
    paid("business", "для сети точек", false),
  ];
}

/** «Сколько стоит?» с настоящей ценой: «от 990 ₽ в месяц». */
function priceAnswer(prices: readonly PlanPrice[]): string {
  const rates = (["team", "business"] as const).map((id) => monthlyRate(prices, id)).filter((r): r is number => r !== null);
  const from = rates.length ? ` — от ${formatRub(Math.round(Math.min(...rates)))} в месяц` : "";
  return `Тариф «Старт» бесплатный: до 5 сотрудников, без срока. Платные тарифы${from}, оплата картой или СБП прямо в кабинете, условия — в публичной оферте.`;
}

const BUSINESS_SUBJECT = "TasksFlow Бизнес: подключение сети точек";

const FAQ = [
  { q: "Нужно ли что-то устанавливать?", a: "Нет. TasksFlow открывается в браузере и на телефоне. Регистрация — за секунду: введите телефон или email." },
  { q: "А сотрудникам сложно разобраться?", a: "Нет. Сотрудник видит простой список задач на день, отмечает «готово» и прикладывает фото. Учить никого не нужно." },
  { q: "Как сотрудники входят?", a: "По телефону без пароля или по QR-коду от руководителя — в один тап." },
  { q: "Подходит для выездных бригад?", a: "Да, для этого и создано: фото-отчёты с объекта, задачи на день, контроль без звонков." },
];

function SectionHead({ eyebrow, title, lead, align = "center" }: { eyebrow: string; title: ReactNode; lead?: string; align?: "center" | "left" }) {
  return (
    <div data-reveal className={`lp-head ${align === "left" ? "is-left" : ""}`}>
      <span className="lp-eyebrow">{eyebrow}</span>
      <h2 className="lp-title">{title}</h2>
      {lead && <p className="lp-lead">{lead}</p>}
    </div>
  );
}

export function LandingPage({ data }: { data: LandingData | null }) {
  const featured = data?.featuredPosts ?? [];
  const { contactEmail } = useSite();
  const prices = data?.prices ?? DEFAULT_PRICES;
  const pricing = pricingCards(prices);
  const faq = [
    ...FAQ,
    { q: "Сколько стоит?", a: priceAnswer(prices) },
    { q: "Как с вами связаться?", a: `Напишите на ${contactEmail} — поможем с запуском и ответим на вопросы.` },
  ];
  // Пришли по ссылке «Попробовать бесплатно» с другой страницы (/#start).
  useEffect(() => {
    if (window.location.hash === "#start") goToStart();
  }, []);
  return (
    <div className="landing min-h-screen bg-background text-foreground overflow-x-hidden">
      <Nav onLanding />

      {/* ===== Hero: тезис + живое демо смены ===== */}
      <section className="hero relative isolate">
        <div className="hero-bg" aria-hidden="true">
          <span className="hero-orb hero-orb-a" />
          <span className="hero-orb hero-orb-b" />
          <span className="hero-grid" />
        </div>

        <div className="max-w-6xl mx-auto px-4 pt-10 sm:pt-16 pb-6 sm:pb-16 grid lg:grid-cols-[minmax(0,1fr)_24rem] gap-14 lg:gap-12 items-center">
          <div className="hero-copy text-center lg:text-left">
            <div data-reveal className="hero-chip">
              <span className="hero-chip-dot" aria-hidden="true" /> Бесплатно навсегда для команды до 5 человек
            </div>
            <h1 data-reveal style={{ transitionDelay: "60ms" }} className="hero-title">
              Ставьте задачи.<br />
              Получайте <span className="vf-word">фото<span className="vf-frame" aria-hidden="true" /></span>.<br />
              Контролируйте смену.
            </h1>
            <p data-reveal style={{ transitionDelay: "120ms" }} className="hero-lead">
              TasksFlow — простой контроль работы сотрудников «в полях»: задачи,
              чек-листы, фото-отчёты и премии. Запуск за день, без обучения.
            </p>
            <div id="start" data-cookie-avoid data-reveal style={{ transitionDelay: "180ms" }} className="mt-8 max-w-lg mx-auto lg:mx-0">
              <AuthForm layout="row" submitLabel="Начать прямо сейчас" submitArrow submitClassName="hero-cta" />
              <ul className="hero-trust">
                {["Карта не нужна", "Запуск за минуту", "Без обучения"].map((t) => (
                  <li key={t}><Check className="w-4 h-4" strokeWidth={3} />{t}</li>
                ))}
              </ul>
              {/* Демо-кабинет: живой кабинет без регистрации, данные в браузере. */}
              <a href="/demo" className="hero-demo-link">
                Или откройте демо-кабинет — без регистрации <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </div>
          <div data-reveal style={{ transitionDelay: "140ms" }} className="lg:pl-4">
            <HeroDemo />
          </div>
        </div>

        <div data-reveal className="max-w-6xl mx-auto px-4 pb-12">
          <IndustryMarquee />
        </div>
      </section>

      {/* ===== Как это работает ===== */}
      <section id="how" className="lp-tint">
        <div className="max-w-6xl mx-auto px-4 py-20 sm:py-24">
          <SectionHead eyebrow="Как это работает" title="Три простых шага" lead="От «поставил задачу» до «вижу результат» — за один день." />
          <div data-reveal>
            <StepsShowcase />
          </div>
        </div>
      </section>

      {/* ===== Возможности ===== */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-20 sm:py-24">
        <SectionHead eyebrow="Возможности" title={<>Всё для <span className="text-primary">контроля задач</span></>} lead="Понятные инструменты — без лишней сложности." />
        <FeatureBento />
      </section>

      {/* ===== Было / Стало ===== */}
      <section className="lp-tint">
        <div className="max-w-6xl mx-auto px-4 py-20 sm:py-24 grid lg:grid-cols-[.9fr_1.1fr] gap-12 lg:gap-16 items-center">
          <div>
            <SectionHead align="left" eyebrow="Было и стало" title="Почувствуйте разницу" lead="Один и тот же вечер смены: рабочий чат и TasksFlow. Потяните ползунок." />
            <div data-reveal className="diff-lists">
              <ul aria-label="Без TasksFlow">
                {BEFORE.map((t) => (
                  <li key={t} className="is-bad"><span><X className="w-3.5 h-3.5" strokeWidth={3} /></span>{t}</li>
                ))}
              </ul>
              <ul aria-label="С TasksFlow">
                {AFTER.map((t) => (
                  <li key={t} className="is-good"><span><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>{t}</li>
                ))}
              </ul>
            </div>
          </div>
          <div data-reveal style={{ transitionDelay: "100ms" }}>
            <CompareSlider />
          </div>
        </div>
      </section>

      {/* ===== Промо-баннер в контенте (если активен) ===== */}
      <div className="max-w-6xl mx-auto px-4 pt-14 empty:hidden">
        <ContentBanner />
      </div>

      {/* ===== Тарифы ===== */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-20 sm:py-24">
        <SectionHead eyebrow="Тарифы" title="Простые тарифы" lead="Начните бесплатно. Платите, когда вырастете." />
        <div className="grid md:grid-cols-3 gap-5 items-stretch">
          {pricing.map((p, i) => (
            <div key={p.name} data-reveal style={{ transitionDelay: `${i * 80}ms` }} className={`plan-card ${p.highlight ? "is-hot" : ""}`}>
              {p.highlight && <div className="plan-badge"><Sparkles className="w-3.5 h-3.5" /> Популярный</div>}
              <h3 className="plan-name">{p.name}</h3>
              <div className="plan-value">{p.price}</div>
              <div className="plan-note">{p.note}</div>
              <ul className="plan-features">
                {p.features.map((f) => (
                  <li key={f}><CheckCircle2 className="w-5 h-5 shrink-0" /><span>{f}</span></li>
                ))}
              </ul>
              {p.action === "mail" ? (
                <a
                  href={`mailto:${contactEmail}?subject=${encodeURIComponent(BUSINESS_SUBJECT)}`}
                  className={`plan-cta press ${p.highlight ? "is-primary" : ""}`}
                >
                  {p.cta}
                </a>
              ) : (
                <a href="#start" onClick={goToStart} className={`plan-cta press ${p.highlight ? "is-primary" : ""}`}>
                  {p.cta}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== Блог-тизер ===== */}
      {featured.length > 0 && (
        <section className="lp-tint">
          <div className="max-w-6xl mx-auto px-4 py-20">
            <div data-reveal className="flex items-end justify-between mb-10">
              <div className="lp-head is-left !mb-0">
                <span className="lp-eyebrow">Блог</span>
                <h2 className="lp-title">Полезное в блоге</h2>
                <p className="lp-lead">Как наводить порядок в задачах и мотивировать команду.</p>
              </div>
              <a href="/blog" className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                Все статьи <ArrowRight className="w-4 h-4" />
              </a>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featured.slice(0, 3).map((p, i) => <ArticleCard key={p.slug} post={p} delay={i * 80} />)}
            </div>
          </div>
        </section>
      )}

      {/* ===== FAQ ===== */}
      <section className="max-w-3xl mx-auto px-4 py-20 sm:py-24">
        <SectionHead eyebrow="Вопросы" title="Частые вопросы" />
        <div className="faq">
          {faq.map((f, i) => (
            <details key={f.q} data-reveal style={{ transitionDelay: `${i * 50}ms` }} className="faq-item">
              <summary>
                {f.q}
                <span className="faq-icon" aria-hidden="true" />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="max-w-6xl mx-auto px-4 pb-24">
        <div data-reveal className="cta-ink">
          <div className="cta-ink-bg" aria-hidden="true" />
          <span className="cta-corner tl" aria-hidden="true" /><span className="cta-corner tr" aria-hidden="true" />
          <span className="cta-corner bl" aria-hidden="true" /><span className="cta-corner br" aria-hidden="true" />
          <div className="relative grid lg:grid-cols-[1.1fr_.9fr] gap-10 items-center">
            <div className="text-center lg:text-left">
              <h2 className="cta-title">Наведите порядок уже сегодня</h2>
              <p className="cta-lead">Регистрация за секунду — по телефону или email. Бесплатно для старта.</p>
              <ul className="cta-points">
                {PLAN_FEATURES.start.map((f) => <li key={f}><Check className="w-4 h-4" strokeWidth={3} />{f}</li>)}
              </ul>
            </div>
            <div className="cta-form" data-cookie-avoid>
              <AuthForm layout="stacked" />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
