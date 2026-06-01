import {
  ClipboardCheck, Camera, Repeat, Wallet, ShieldCheck, Users, BarChart3,
  CheckCircle2, ArrowRight, Smartphone, Bell, Star, Sparkles,
} from "lucide-react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { ArticleCard } from "../components/ArticleCard";
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

const FEATURES = [
  { icon: ClipboardCheck, title: "Задачи и чек-листы", text: "Ставьте задачи сотрудникам, разбивайте на чек-листы и регламенты. Видно, что сделано, а что нет." },
  { icon: Camera, title: "Фотоотчёты", text: "Требуйте фото выполнения. Сотрудник прикладывает снимок — вы проверяете не выходя с объекта." },
  { icon: Repeat, title: "Повторяющиеся задачи", text: "Ежедневные и еженедельные задачи сбрасываются автоматически. Рутина — на автопилоте." },
  { icon: Wallet, title: "Бонусы и штрафы", text: "Начисляйте премии за выполнение и KPI. Прозрачная мотивация прямо в задачах." },
  { icon: ShieldCheck, title: "Двухстадийная проверка", text: "Сотрудник сдал — ответственный подтвердил. Премия начисляется только после проверки." },
  { icon: BarChart3, title: "Контроль и аналитика", text: "Кто, что и когда выполнил. Полная картина по сотрудникам и объектам в реальном времени." },
];

const STEPS = [
  { icon: Smartphone, title: "Зарегистрируйтесь за секунду", text: "Введите телефон или email — аккаунт создан, вы сразу в кабинете." },
  { icon: Users, title: "Добавьте сотрудников", text: "Пригласите команду по QR-коду или телефону. Они входят в один тап без паролей." },
  { icon: ClipboardCheck, title: "Поставьте задачи", text: "Создайте задачи с чек-листами, фото и премиями. Назначьте исполнителей и проверяющих." },
  { icon: Bell, title: "Контролируйте", text: "Получайте фотоотчёты и видите прогресс. Подтверждайте выполнение и начисляйте бонусы." },
];

const INDUSTRIES = [
  { title: "Клининг", text: "Уборка по чек-листам, фото до/после, контроль выездных бригад." },
  { title: "Общепит и розница", text: "Открытие/закрытие смены, санитария, выкладка — всё под контролем." },
  { title: "Сервис и ремонт", text: "Выездные мастера, заявки, фотофиксация работ на объекте." },
  { title: "Охрана и эксплуатация", text: "Обходы, регламенты, отметки о выполнении в срок." },
  { title: "Логистика", text: "Задачи водителям и складу, повторяющиеся маршруты и проверки." },
  { title: "Производство", text: "Контроль производственных процессов и дисциплины смен." },
];

const COMPARISON = [
  { them: "Мессенджеры (WhatsApp/Telegram)", us: "Задачи теряются в чате", usText: "Структура, статусы, фотоотчёты и история по каждому" },
  { them: "Бумага и Excel", us: "Нет контроля в реальном времени", usText: "Онлайн-картина по всем сотрудникам и объектам" },
  { them: "Тяжёлые CRM/таск-трекеры", us: "Долгое внедрение, не для «полевых»", usText: "Запуск за день, простой вход для линейного персонала" },
];

const PRICING = [
  { name: "Старт", price: "0 ₽", note: "заглушка — поправите", features: ["До 5 сотрудников", "Задачи и чек-листы", "Фотоотчёты", "Email-поддержка"], cta: "Начать бесплатно", highlight: false },
  { name: "Команда", price: "990 ₽", note: "/мес · заглушка", features: ["До 30 сотрудников", "Повторяющиеся задачи", "Бонусы и KPI", "Двухстадийная проверка", "QR-приглашения"], cta: "Попробовать", highlight: true },
  { name: "Бизнес", price: "по запросу", note: "заглушка", features: ["Без лимита сотрудников", "Интеграции и API", "Приоритетная поддержка", "Онбординг команды"], cta: "Обсудить", highlight: false },
];

const FAQ = [
  { q: "Нужно ли что-то устанавливать?", a: "Нет. TasksFlow работает в браузере и на телефоне. Регистрация занимает секунду — введите телефон или email." },
  { q: "Подходит ли для выездных сотрудников?", a: "Да, продукт создан именно для линейного и выездного персонала: простой вход, фотоотчёты с телефона, понятный список задач на день." },
  { q: "Как сотрудники входят в систему?", a: "По телефону без пароля или по QR-приглашению от руководителя. Это занимает один тап." },
  { q: "Можно ли контролировать выполнение по фото?", a: "Да. Для задачи можно включить обязательный фотоотчёт — сотрудник прикладывает снимок, а вы проверяете и подтверждаете." },
  { q: "Сколько стоит?", a: "Есть бесплатный тариф для небольших команд. Платные тарифы на странице «Тарифы» (сейчас это заглушка — финальные цены появятся позже)." },
];

export function LandingPage({ data }: { data: LandingData | null }) {
  const featured = data?.featuredPosts ?? [];
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Nav onLanding />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <Aurora
          orbs={[
            { cls: "orb-a", style: { width: 560, height: 560, left: -140, top: -160, background: "radial-gradient(circle, hsl(var(--primary)/0.6), transparent 70%)" } },
            { cls: "orb-b", style: { width: 480, height: 480, right: -120, top: 20, background: "radial-gradient(circle, rgba(139,92,246,0.55), transparent 70%)" } },
            { cls: "orb-c", style: { width: 420, height: 420, left: "38%", top: 200, background: "radial-gradient(circle, rgba(34,211,238,0.4), transparent 70%)" } },
          ]}
        />
        <div className="absolute inset-0 -z-10 bg-grid" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-background/30 to-background" aria-hidden="true" />

        <div className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
          <div data-reveal className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 backdrop-blur px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6">
            <Star className="w-3.5 h-3.5 text-primary" /> Контроль выездных и линейных команд
          </div>
          <h1 data-reveal style={{ transitionDelay: "70ms" }} className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Задачи под контролем.<br />
            <span className="text-gradient">Сотрудники — на результат.</span>
          </h1>
          <p data-reveal style={{ transitionDelay: "140ms" }} className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            TasksFlow — это постановка задач, чек-листы, фотоотчёты, повторяющиеся задачи
            и бонусы для выездных и линейных сотрудников. Запуск за день.
          </p>
          <div data-reveal style={{ transitionDelay: "210ms" }} className="mt-8 max-w-xl mx-auto">
            <AuthForm layout="row" />
          </div>
          <div data-reveal style={{ transitionDelay: "280ms" }} className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Бесплатно для старта</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Без установки</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Запуск за день</span>
          </div>
        </div>
      </section>

      {/* Боль/решение */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-6">
          <div data-reveal className="rounded-2xl border border-border bg-card p-7 hover-lift">
            <h2 className="text-xl font-bold mb-4">Знакомо?</h2>
            <ul className="space-y-3 text-muted-foreground">
              {["Задачи теряются в переписке и на словах", "Не видно, кто и что реально сделал", "Сотрудники «забывают» рутинные задачи", "Нет доказательств выполнения — только «сделал, честно»"].map((t) => (
                <li key={t} className="flex gap-3"><span className="text-destructive mt-1">✕</span><span>{t}</span></li>
              ))}
            </ul>
          </div>
          <div data-reveal style={{ transitionDelay: "100ms" }} className="relative rounded-2xl border border-primary/30 bg-primary/5 p-7 overflow-hidden hover-lift">
            <div className="orb orb-b" aria-hidden="true" style={{ width: 240, height: 240, right: -80, top: -80, background: "radial-gradient(circle, hsl(var(--primary)/0.35), transparent 70%)", filter: "blur(50px)" }} />
            <h2 className="relative text-xl font-bold mb-4">С TasksFlow</h2>
            <ul className="relative space-y-3">
              {["Каждая задача — со статусом, сроком и исполнителем", "Фотоотчёт подтверждает выполнение", "Повторяющиеся задачи ставятся сами", "Прозрачная мотивация: бонусы за результат"].map((t) => (
                <li key={t} className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" /><span>{t}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Возможности */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <div data-reveal className="text-center mb-12">
          <h2 className="text-3xl font-extrabold">Всё для <span className="text-gradient">контроля задач</span></h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">Инструменты, которые реально используют — без лишней сложности.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div key={f.title} data-reveal style={{ transitionDelay: `${(i % 3) * 80}ms` }} className="group rounded-2xl border border-border bg-card p-6 hover-lift">
              <div className="icon-glow w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Как работает */}
      <section id="how" className="relative bg-muted/30 border-y border-border overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-dots opacity-60" aria-hidden="true" />
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div data-reveal className="text-center mb-12">
            <h2 className="text-3xl font-extrabold">Как это работает</h2>
            <p className="mt-3 text-muted-foreground">Четыре шага от регистрации до контроля.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s, i) => (
              <div key={s.title} data-reveal style={{ transitionDelay: `${i * 80}ms` }} className="group relative rounded-2xl border border-border bg-card p-6 hover-lift">
                <div className="text-5xl font-extrabold text-primary/15 absolute top-3 right-4">{i + 1}</div>
                <div className="icon-glow w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <s.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Отрасли */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <div data-reveal className="text-center mb-12">
          <h2 className="text-3xl font-extrabold">Для кого</h2>
          <p className="mt-3 text-muted-foreground">TasksFlow закрывает контроль задач в любой «полевой» команде.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {INDUSTRIES.map((it, i) => (
            <div key={it.title} data-reveal style={{ transitionDelay: `${(i % 3) * 80}ms` }} className="rounded-2xl border border-border bg-card p-6 hover-lift">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span className="w-1.5 h-5 rounded-full bg-primary/70" /> {it.title}
              </h3>
              <p className="text-sm text-muted-foreground">{it.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Сравнение */}
      <section className="relative bg-muted/30 border-y border-border overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-grid opacity-50" aria-hidden="true" />
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div data-reveal className="text-center mb-12">
            <h2 className="text-3xl font-extrabold">Почему не «как раньше»</h2>
          </div>
          <div className="space-y-4">
            {COMPARISON.map((c, i) => (
              <div key={c.them} data-reveal style={{ transitionDelay: `${i * 70}ms` }} className="grid md:grid-cols-2 gap-4 rounded-2xl border border-border bg-card p-6 hover-lift">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">{c.them}</div>
                  <div className="text-destructive flex gap-2"><span>✕</span><span>{c.us}</span></div>
                </div>
                <div className="md:border-l md:border-border md:pl-6">
                  <div className="text-sm font-medium text-primary mb-1">TasksFlow</div>
                  <div className="flex gap-2"><CheckCircle2 className="w-5 h-5 text-primary shrink-0" /><span>{c.usText}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Тарифы */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16">
        <div data-reveal className="text-center mb-12">
          <h2 className="text-3xl font-extrabold">Тарифы</h2>
          <p className="mt-3 text-muted-foreground">Цифры пока примерные — финальные тарифы появятся позже.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PRICING.map((p, i) => (
            <div
              key={p.name}
              data-reveal
              style={{ transitionDelay: `${i * 90}ms` }}
              className={`relative rounded-2xl border p-7 flex flex-col overflow-hidden ${p.highlight ? "border-primary ring-2 ring-primary/30 bg-card md:-translate-y-2 shadow-xl shadow-primary/10" : "border-border bg-card hover-lift"}`}
            >
              {p.highlight && (
                <div className="orb orb-a" aria-hidden="true" style={{ width: 260, height: 260, right: -90, top: -90, background: "radial-gradient(circle, hsl(var(--primary)/0.4), transparent 70%)", filter: "blur(50px)" }} />
              )}
              {p.highlight && <div className="relative inline-flex items-center gap-1 text-xs font-semibold text-primary mb-2"><Sparkles className="w-3.5 h-3.5" /> Популярный</div>}
              <h3 className="relative font-bold text-lg">{p.name}</h3>
              <div className="relative mt-2 mb-1 text-3xl font-extrabold">{p.price}</div>
              <div className="relative text-xs text-muted-foreground mb-5">{p.note}</div>
              <ul className="relative space-y-2 text-sm flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span>{f}</span></li>
                ))}
              </ul>
              <a href="/" className={`relative mt-6 inline-flex justify-center rounded-full px-5 py-2.5 text-sm font-semibold ${p.highlight ? "bg-primary text-primary-foreground shine" : "border border-border hover:bg-muted"}`}>
                {p.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Блог-тизер */}
      {featured.length > 0 && (
        <section className="bg-muted/30 border-y border-border">
          <div className="max-w-6xl mx-auto px-4 py-16">
            <div data-reveal className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-3xl font-extrabold">Из блога</h2>
                <p className="mt-2 text-muted-foreground">Практика контроля задач и мотивации персонала.</p>
              </div>
              <a href="/blog" className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Все статьи <ArrowRight className="w-4 h-4" />
              </a>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featured.slice(0, 3).map((p, i) => <ArticleCard key={p.slug} post={p} delay={i * 80} />)}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <div data-reveal className="text-center mb-10">
          <h2 className="text-3xl font-extrabold">Частые вопросы</h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((f, i) => (
            <details key={f.q} data-reveal style={{ transitionDelay: `${i * 50}ms` }} className="group rounded-xl border border-border bg-card p-5 open:border-primary/30 transition-colors">
              <summary className="font-semibold cursor-pointer list-none flex justify-between items-center">
                {f.q}
                <span className="text-primary text-xl leading-none group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div data-reveal className="relative rounded-3xl bg-primary text-primary-foreground p-10 text-center overflow-hidden">
          <div className="orb" aria-hidden="true" style={{ width: 360, height: 360, left: -100, top: -120, background: "radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%)", filter: "blur(60px)", opacity: 0.5 }} />
          <div className="orb orb-c" aria-hidden="true" style={{ width: 320, height: 320, right: -90, bottom: -120, background: "radial-gradient(circle, rgba(34,211,238,0.5), transparent 70%)", filter: "blur(60px)", opacity: 0.5 }} />
          <h2 className="relative text-3xl font-extrabold mb-3">Наведите порядок в задачах сегодня</h2>
          <p className="relative opacity-90 mb-7 max-w-xl mx-auto">Регистрация за секунду — по телефону или email. Бесплатно для старта, без установки.</p>
          <div className="relative max-w-md mx-auto bg-card text-foreground rounded-2xl p-5 shadow-2xl">
            <AuthForm layout="stacked" />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
