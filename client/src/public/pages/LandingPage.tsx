import {
  ClipboardCheck, Camera, Repeat, Wallet, ShieldCheck, Users, BarChart3,
  CheckCircle2, ArrowRight, Smartphone, Bell, QrCode, Star,
} from "lucide-react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { ArticleCard } from "../components/ArticleCard";
import { AuthForm } from "../landing/auth";
import type { LandingData } from "../types";

const FEATURES = [
  { icon: ClipboardCheck, title: "Задачи и чек-листы", text: "Ставьте задачи сотрудникам, разбивайте на чек-листы и регламенты. Видно, что сделано, а что нет." },
  { icon: Camera, title: "Фотоотчёты", text: "Требуйте фото выполнения. Сотрудник прикладывает снимок — вы проверяете не выходя с объекта." },
  { icon: Repeat, title: "Повторяющиеся задачи", text: "Ежедневные и еженедельные задачи сбрасываются автоматически. Рутина — на автопилоте." },
  { icon: Wallet, title: "Бонусы и штрафы", text: "Начисляйте премии за выполнение и KPI. Прозрачная мотивация прямо в задачах." },
  { icon: ShieldCheck, title: "Двухстадийная проверка", text: "Сотрудник сдал — ответственный подтвердил. Премия начисляется только после проверки." },
  { icon: BarChart3, title: "Контроль и аналитика", text: "Кто, что и когда выполнил. Полная картина по сотрудникам и объектам в реальном времени." },
];

const STEPS = [
  { icon: Smartphone, title: "Зарегистрируйтесь за секунду", text: "Введите email — аккаунт создан, вы сразу в кабинете. Пароль придёт на почту." },
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
  { q: "Нужно ли что-то устанавливать?", a: "Нет. TasksFlow работает в браузере и на телефоне. Регистрация по email занимает секунду — пароль приходит на почту, но входить можно сразу." },
  { q: "Подходит ли для выездных сотрудников?", a: "Да, продукт создан именно для линейного и выездного персонала: простой вход, фотоотчёты с телефона, понятный список задач на день." },
  { q: "Как сотрудники входят в систему?", a: "По телефону без пароля или по QR-приглашению от руководителя. Это занимает один тап." },
  { q: "Можно ли контролировать выполнение по фото?", a: "Да. Для задачи можно включить обязательный фотоотчёт — сотрудник прикладывает снимок, а вы проверяете и подтверждаете." },
  { q: "Сколько стоит?", a: "Есть бесплатный тариф для небольших команд. Платные тарифы на странице «Тарифы» (сейчас это заглушка — финальные цены появятся позже)." },
];

export function LandingPage({ data }: { data: LandingData | null }) {
  const featured = data?.featuredPosts ?? [];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav onLanding />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-background to-background" />
        <div className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6">
            <Star className="w-3.5 h-3.5 text-primary" /> Контроль выездных и линейных команд
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.05]">
            Задачи под контролем.<br />
            <span className="text-primary">Сотрудники — на результат.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            TasksFlow — это постановка задач, чек-листы, фотоотчёты, повторяющиеся задачи
            и бонусы для выездных и линейных сотрудников. Запуск за день.
          </p>
          <div className="mt-8 max-w-xl mx-auto">
            <AuthForm layout="row" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Бесплатно для старта</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Без установки</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> Запуск за день</span>
          </div>
        </div>
      </section>

      {/* Боль/решение */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-border bg-card p-7">
            <h2 className="text-xl font-bold mb-4">Знакомо?</h2>
            <ul className="space-y-3 text-muted-foreground">
              {["Задачи теряются в переписке и на словах", "Не видно, кто и что реально сделал", "Сотрудники «забывают» рутинные задачи", "Нет доказательств выполнения — только «сделал, честно»"].map((t) => (
                <li key={t} className="flex gap-3"><span className="text-destructive mt-1">✕</span><span>{t}</span></li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-7">
            <h2 className="text-xl font-bold mb-4">С TasksFlow</h2>
            <ul className="space-y-3">
              {["Каждая задача — со статусом, сроком и исполнителем", "Фотоотчёт подтверждает выполнение", "Повторяющиеся задачи ставятся сами", "Прозрачная мотивация: бонусы за результат"].map((t) => (
                <li key={t} className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" /><span>{t}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Возможности */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold">Всё для контроля задач</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">Инструменты, которые реально используют — без лишней сложности.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Как работает */}
      <section id="how" className="bg-muted/30 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold">Как это работает</h2>
            <p className="mt-3 text-muted-foreground">Четыре шага от регистрации до контроля.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative rounded-2xl border border-border bg-card p-6">
                <div className="text-5xl font-extrabold text-primary/15 absolute top-3 right-4">{i + 1}</div>
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
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
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold">Для кого</h2>
          <p className="mt-3 text-muted-foreground">TasksFlow закрывает контроль задач в любой «полевой» команде.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {INDUSTRIES.map((it) => (
            <div key={it.title} className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold mb-2">{it.title}</h3>
              <p className="text-sm text-muted-foreground">{it.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Сравнение */}
      <section className="bg-muted/30 border-y border-border">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold">Почему не «как раньше»</h2>
          </div>
          <div className="space-y-4">
            {COMPARISON.map((c) => (
              <div key={c.them} className="grid md:grid-cols-2 gap-4 rounded-2xl border border-border bg-card p-6">
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
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold">Тарифы</h2>
          <p className="mt-3 text-muted-foreground">Цифры пока примерные — финальные тарифы появятся позже.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PRICING.map((p) => (
            <div key={p.name} className={`rounded-2xl border p-7 flex flex-col ${p.highlight ? "border-primary ring-2 ring-primary/30 bg-card" : "border-border bg-card"}`}>
              {p.highlight && <div className="text-xs font-semibold text-primary mb-2">Популярный</div>}
              <h3 className="font-bold text-lg">{p.name}</h3>
              <div className="mt-2 mb-1 text-3xl font-extrabold">{p.price}</div>
              <div className="text-xs text-muted-foreground mb-5">{p.note}</div>
              <ul className="space-y-2 text-sm flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span>{f}</span></li>
                ))}
              </ul>
              <a href="/" className={`mt-6 inline-flex justify-center rounded-full px-5 py-2.5 text-sm font-semibold ${p.highlight ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}>
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
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-3xl font-extrabold">Из блога</h2>
                <p className="mt-2 text-muted-foreground">Практика контроля задач и мотивации персонала.</p>
              </div>
              <a href="/blog" className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Все статьи <ArrowRight className="w-4 h-4" />
              </a>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featured.slice(0, 3).map((p) => <ArticleCard key={p.slug} post={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-extrabold text-center mb-10">Частые вопросы</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-xl border border-border bg-card p-5">
              <summary className="font-semibold cursor-pointer list-none flex justify-between items-center">
                {f.q}
                <span className="text-primary group-open:rotate-45 transition">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="rounded-3xl bg-primary text-primary-foreground p-10 text-center">
          <h2 className="text-3xl font-extrabold mb-3">Наведите порядок в задачах сегодня</h2>
          <p className="opacity-90 mb-7 max-w-xl mx-auto">Регистрация по email за секунду. Бесплатно для старта, без установки.</p>
          <div className="max-w-md mx-auto bg-card text-foreground rounded-2xl p-5">
            <AuthForm layout="stacked" />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
