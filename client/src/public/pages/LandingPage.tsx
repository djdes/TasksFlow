import {
  Check, Camera, ClipboardCheck, Repeat, Wallet, ShieldCheck, BarChart3,
  Smartphone, CheckCircle2, ArrowRight, Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { ArticleCard } from "../components/ArticleCard";
import { Particles } from "../components/Particles";
import { ContentBanner } from "../components/ContentBanner";
import { AuthForm } from "../landing/auth";
import type { LandingData } from "../types";

/** Декоративные размытые орбы фона (аврора). */
function Aurora({ orbs }: { orbs: Array<{ cls: string; style: React.CSSProperties }> }) {
  return (
    <div className="aurora" aria-hidden="true">
      {orbs.map((o, i) => (
        <div key={i} className={`orb ${o.cls}`} style={o.style} />
      ))}
    </div>
  );
}

/** Наглядный макет продукта: список задач на смену с фото и премией. */
// Интерактивный макет: галочки реально переключаются, прогресс живой,
// «Отправить отчёт» закрывает все задачи и показывает начисление премии.
// SSR-безопасно: начальное состояние детерминировано (2 из 4).
function ProductMock() {
  const [items, setItems] = useState([
    { t: "Открыть смену", done: true, photo: false },
    { t: "Протереть витрину", done: false, photo: true },
    { t: "Выложить товар по полкам", done: true, photo: false },
    { t: "Проверить ценники", done: false, photo: true },
  ]);
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  const toggle = (idx: number) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)));
  const submitAll = () => setItems((prev) => prev.map((it) => ({ ...it, done: true })));

  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-primary/20 blur-3xl" aria-hidden="true" />
      <div className="float-card rounded-3xl border border-border bg-card soft-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-muted-foreground">Магазин на Ленина</div>
            <div className="font-extrabold text-lg">Задачи на сегодня</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-bold">М</div>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${(doneCount / items.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">{doneCount} из {items.length}</span>
        </div>
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                className="w-full flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-left cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/40 press"
                aria-pressed={it.done}
              >
                <span
                  className={`w-5 h-5 rounded-md grid place-items-center shrink-0 border-2 transition-colors ${
                    it.done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 transition-transform duration-200 ${it.done ? "scale-100" : "scale-0"}`} />
                </span>
                <span className={`text-sm flex-1 transition-colors ${it.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {it.t}
                </span>
                {it.photo && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <Camera className="w-3 h-3" /> фото
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={submitAll}
          className="shine press mt-4 w-full rounded-xl bg-primary text-primary-foreground font-semibold py-2.5 text-sm transition disabled:opacity-100"
        >
          {allDone ? "Отчёт отправлен ✓" : "Отправить отчёт"}
        </button>
      </div>
      <div
        className={`absolute -right-3 -bottom-4 sm:-right-7 rounded-2xl border bg-card soft-card px-3.5 py-2.5 flex items-center gap-2 transition-all duration-300 ${
          allDone ? "scale-105 border-green-500/40 ring-2 ring-green-500/25" : "border-border"
        }`}
      >
        <span className="w-7 h-7 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 grid place-items-center">
          <Check className="w-4 h-4" />
        </span>
        <div className="leading-tight">
          <div className="text-[11px] text-muted-foreground">Премия начислена</div>
          <div className="text-sm font-bold">+300 ₽</div>
        </div>
      </div>
    </div>
  );
}

const INDUSTRIES = ["Клининг", "Общепит", "Розница", "Сервис и ремонт", "Логистика", "Охрана", "Производство"];

const STEPS = [
  { icon: ClipboardCheck, title: "1. Поставьте задачи", text: "Напишите, что нужно сделать. Добавьте чек-лист и фото-пример — за пару минут." },
  { icon: Smartphone, title: "2. Сотрудник выполняет", text: "Видит список на день в телефоне. Отмечает «готово» и прикладывает фото." },
  { icon: ShieldCheck, title: "3. Вы контролируете", text: "Видите, что и как сделано. Подтверждаете и начисляете премию." },
];

const FEATURES = [
  { icon: ClipboardCheck, title: "Задачи и чек-листы", text: "Понятный список дел на смену для каждого сотрудника." },
  { icon: Camera, title: "Фото-отчёты", text: "Сделано — значит есть фото. Никаких «сделал, честно»." },
  { icon: Repeat, title: "Повторяющиеся задачи", text: "Ежедневная рутина ставится сама, без напоминаний." },
  { icon: Wallet, title: "Премии за результат", text: "Прозрачная мотивация: бонус приходит за выполненное." },
  { icon: ShieldCheck, title: "Проверка «сдал — принял»", text: "Старший подтверждает работу. Премия — только после проверки." },
  { icon: BarChart3, title: "Отчёты по людям", text: "Видно, кто молодец, а кто отстаёт. В реальном времени." },
];

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

const PRICING = [
  { name: "Старт", price: "0 ₽", note: "навсегда", features: ["До 5 сотрудников", "Задачи и чек-листы", "Фото-отчёты"], cta: "Начать бесплатно", highlight: false },
  { name: "Команда", price: "990 ₽", note: "в месяц · примерно", features: ["До 30 сотрудников", "Повторяющиеся задачи", "Премии и проверка", "Приглашение по QR"], cta: "Попробовать", highlight: true },
  { name: "Бизнес", price: "по запросу", note: "для сети точек", features: ["Без лимита сотрудников", "Интеграции и API", "Помощь с запуском"], cta: "Обсудить", highlight: false },
];

const FAQ = [
  { q: "Нужно ли что-то устанавливать?", a: "Нет. TasksFlow открывается в браузере и на телефоне. Регистрация — за секунду: введите телефон или email." },
  { q: "А сотрудникам сложно разобраться?", a: "Нет. Сотрудник видит простой список задач на день, отмечает «готово» и прикладывает фото. Учить никого не нужно." },
  { q: "Как сотрудники входят?", a: "По телефону без пароля или по QR-коду от руководителя — в один тап." },
  { q: "Подходит для выездных бригад?", a: "Да, для этого и создано: фото-отчёты с объекта, задачи на день, контроль без звонков." },
  { q: "Сколько стоит?", a: "Есть бесплатный тариф для небольших команд. Платные тарифы — на странице «Тарифы» (цифры пока примерные)." },
];

export function LandingPage({ data }: { data: LandingData | null }) {
  const featured = data?.featuredPosts ?? [];
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Nav onLanding />

      {/* ===== Hero ===== */}
      <section className="relative isolate overflow-hidden grain">
        <Aurora
          orbs={[
            { cls: "orb-a", style: { width: 560, height: 560, left: -160, top: -180, background: "radial-gradient(circle, hsl(var(--primary)/0.55), transparent 70%)" } },
            { cls: "orb-b", style: { width: 480, height: 480, right: -140, top: -40, background: "radial-gradient(circle, rgba(139,92,246,0.5), transparent 70%)" } },
          ]}
        />
        <Particles />
        <div className="shape shape-ring" aria-hidden="true" style={{ width: 280, height: 280, left: -100, top: 20 }} />
        <div className="shape shape-ring2" aria-hidden="true" style={{ width: 200, height: 200, right: -70, bottom: -50 }} />
        <div className="shape shape-sq" aria-hidden="true" style={{ width: 84, height: 84, left: "8%", bottom: "12%", transform: "rotate(12deg)" }} />
        <div className="absolute inset-0 -z-10 bg-grid" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-background/20 to-background" aria-hidden="true" />

        <div className="max-w-6xl mx-auto px-4 pt-16 pb-20 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Текст */}
          <div className="text-center lg:text-left">
            <div data-reveal className="inline-flex items-center gap-2 rounded-full cta-grad text-white px-4 py-1.5 text-xs sm:text-sm font-bold shadow-lg shadow-primary/30 mb-6">
              <Sparkles className="w-4 h-4" /> Бесплатно навсегда для команды до 5 человек
            </div>
            <h1 data-reveal style={{ transitionDelay: "70ms" }} className="text-4xl sm:text-5xl xl:text-6xl font-extrabold leading-[1.05]">
              Ставьте задачи.<br />
              Получайте <span className="text-gradient">фото</span>.<br />
              Контролируйте смену.
            </h1>
            <p data-reveal style={{ transitionDelay: "140ms" }} className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0">
              TasksFlow — простой контроль работы сотрудников «в полях»: задачи,
              чек-листы, фото-отчёты и премии. Запуск за день, без обучения.
            </p>
            <div data-reveal style={{ transitionDelay: "210ms" }} className="mt-8 max-w-lg mx-auto lg:mx-0">
              <AuthForm
                layout="row"
                submitLabel="Начать прямо сейчас"
                submitArrow
                submitClassName="cta-pulse cta-grad text-base sm:text-lg font-bold"
              />
              <p className="mt-2.5 text-sm font-medium text-foreground/70">
                Карта не нужна · запуск за минуту · без обучения
              </p>
            </div>
          </div>
          {/* Макет */}
          <div data-reveal style={{ transitionDelay: "160ms" }} className="lg:pl-6">
            <ProductMock />
          </div>
        </div>

        {/* Отрасли — простой ряд */}
        <div className="max-w-6xl mx-auto px-4 pb-10">
          <div data-reveal className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm">
            <span className="text-muted-foreground">Работает в:</span>
            {INDUSTRIES.map((it) => (
              <span key={it} className="rounded-full border border-border bg-card px-3 py-1 font-medium">{it}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Как это работает ===== */}
      <section id="how" className="relative isolate bg-muted/30 border-y border-border overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-dots opacity-60" aria-hidden="true" />
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div data-reveal className="text-center mb-14 max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold">Три простых шага</h2>
            <p className="mt-3 text-muted-foreground text-lg">От «поставил задачу» до «вижу результат» — за один день.</p>
          </div>
          <div className="relative grid md:grid-cols-3 gap-6">
            {/* Пунктирная линия, соединяющая шаги (видна в зазорах, desktop) */}
            <div aria-hidden="true" className="hidden md:block absolute left-[16%] right-[16%] top-[64px] border-t-2 border-dashed border-primary/25" />
            {STEPS.map((s, i) => (
              <div key={s.title} data-reveal style={{ transitionDelay: `${i * 90}ms` }} className="group relative rounded-3xl border border-border bg-card soft-card p-7 hover-lift">
                <div className="icon-glow w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
                  <s.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold mb-2">{s.title}</h3>
                <p className="text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Возможности ===== */}
      <section id="features" className="relative isolate overflow-hidden max-w-6xl mx-auto px-4 py-20">
        <Particles />
        <div data-reveal className="text-center mb-14 max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold">Всё для <span className="text-gradient">контроля задач</span></h2>
          <p className="mt-3 text-muted-foreground text-lg">Понятные инструменты — без лишней сложности.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div key={f.title} data-reveal style={{ transitionDelay: `${(i % 3) * 80}ms` }} className="group rounded-2xl border border-border bg-card p-6 hover-lift">
              <div className="icon-glow w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-1.5">{f.title}</h3>
              <p className="text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Было / Стало ===== */}
      <section className="relative isolate bg-muted/30 border-y border-border overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-grid opacity-50" aria-hidden="true" />
        <div className="max-w-5xl mx-auto px-4 py-20">
          <div data-reveal className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold">Почувствуйте разницу</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div data-reveal className="rounded-3xl border border-border bg-card p-7">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-5">
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" /> Без TasksFlow
              </div>
              <ul className="space-y-3.5">
                {BEFORE.map((t) => (
                  <li key={t} className="flex gap-3 text-muted-foreground">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-destructive/10 text-destructive grid place-items-center text-xs shrink-0">✕</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal style={{ transitionDelay: "100ms" }} className="relative rounded-3xl border-2 border-primary/30 bg-primary/5 p-7 overflow-hidden soft-card">
              <div className="orb orb-b" aria-hidden="true" style={{ width: 220, height: 220, right: -70, top: -70, background: "radial-gradient(circle, hsl(var(--primary)/0.35), transparent 70%)", filter: "blur(45px)" }} />
              <div className="relative inline-flex items-center gap-2 text-sm font-semibold text-primary mb-5">
                <Sparkles className="w-4 h-4" /> С TasksFlow
              </div>
              <ul className="relative space-y-3.5">
                {AFTER.map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-primary text-primary-foreground grid place-items-center shrink-0"><Check className="w-3.5 h-3.5" /></span>
                    <span className="font-medium">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Промо-баннер в контенте (если активен) ===== */}
      <div className="max-w-6xl mx-auto px-4 pt-14">
        <ContentBanner />
      </div>

      {/* ===== Тарифы ===== */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-20">
        <div data-reveal className="text-center mb-14 max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold">Простые тарифы</h2>
          <p className="mt-3 text-muted-foreground text-lg">Начните бесплатно. Платите, когда вырастете.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {PRICING.map((p, i) => (
            <div
              key={p.name}
              data-reveal
              style={{ transitionDelay: `${i * 90}ms` }}
              className={`relative rounded-3xl border p-7 flex flex-col overflow-hidden ${p.highlight ? "border-2 border-primary bg-card soft-card md:-translate-y-3" : "border-border bg-card hover-lift"}`}
            >
              {p.highlight && (
                <div className="orb orb-a" aria-hidden="true" style={{ width: 240, height: 240, right: -80, top: -80, background: "radial-gradient(circle, hsl(var(--primary)/0.35), transparent 70%)", filter: "blur(45px)" }} />
              )}
              {p.highlight && <div className="relative inline-flex items-center gap-1 text-xs font-bold text-primary mb-2"><Sparkles className="w-3.5 h-3.5" /> Популярный</div>}
              <h3 className="relative font-bold text-xl">{p.name}</h3>
              <div className="relative mt-3 flex items-end gap-1">
                <span className="text-4xl font-extrabold">{p.price}</span>
              </div>
              <div className="relative text-sm text-muted-foreground mb-6">{p.note}</div>
              <ul className="relative space-y-3 text-sm flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5"><CheckCircle2 className="w-5 h-5 text-primary mt-px shrink-0" /><span>{f}</span></li>
                ))}
              </ul>
              <a href="/" className={`relative mt-7 inline-flex justify-center rounded-full px-5 py-3 text-sm font-bold ${p.highlight ? "bg-primary text-primary-foreground shine" : "border border-border hover:bg-muted"}`}>
                {p.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Блог-тизер ===== */}
      {featured.length > 0 && (
        <section className="bg-muted/30 border-y border-border">
          <div className="max-w-6xl mx-auto px-4 py-20">
            <div data-reveal className="flex items-end justify-between mb-10">
              <div>
                <h2 className="text-3xl sm:text-4xl font-extrabold">Полезное в блоге</h2>
                <p className="mt-3 text-muted-foreground text-lg">Как наводить порядок в задачах и мотивировать команду.</p>
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
      <section className="max-w-3xl mx-auto px-4 py-20">
        <div data-reveal className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold">Частые вопросы</h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((f, i) => (
            <details key={f.q} data-reveal style={{ transitionDelay: `${i * 50}ms` }} className="group rounded-2xl border border-border bg-card p-5 open:border-primary/40 transition-colors">
              <summary className="font-bold cursor-pointer list-none flex justify-between items-center gap-4">
                {f.q}
                <span className="text-primary text-2xl leading-none group-open:rotate-45 transition-transform shrink-0">+</span>
              </summary>
              <p className="mt-3 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="max-w-4xl mx-auto px-4 pb-24">
        <div data-reveal className="relative rounded-[2rem] bg-primary text-primary-foreground p-10 sm:p-14 text-center overflow-hidden">
          <div className="orb" aria-hidden="true" style={{ width: 380, height: 380, left: -110, top: -130, background: "radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%)", filter: "blur(60px)", opacity: 0.5 }} />
          <div className="orb orb-c" aria-hidden="true" style={{ width: 340, height: 340, right: -100, bottom: -130, background: "radial-gradient(circle, rgba(34,211,238,0.5), transparent 70%)", filter: "blur(60px)", opacity: 0.5 }} />
          <h2 className="relative text-3xl sm:text-4xl font-extrabold mb-3">Наведите порядок уже сегодня</h2>
          <p className="relative opacity-90 mb-8 max-w-xl mx-auto text-lg">Регистрация за секунду — по телефону или email. Бесплатно для старта.</p>
          <div className="relative max-w-md mx-auto bg-card text-foreground rounded-2xl p-5 soft-card">
            <AuthForm layout="stacked" />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
