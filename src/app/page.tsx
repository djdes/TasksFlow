import Link from "next/link";
import {
  Shield,
  Bell,
  FileText,
  ClipboardList,
  ThermometerSun,
  Check,
  Tablet,
  Wifi,
  ScanBarcode,
  PackageCheck,
  ArrowRight,
  Zap,
  Lock,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

const features = [
  {
    icon: ClipboardList,
    title: "18 электронных журналов",
    description:
      "Все обязательные журналы по СанПиН 2.3/2.4.3590-20 и ХАССП: температурный режим, входной контроль, бракераж, гигиена и здоровье персонала, ККТ, уборка, дезинфекция, фритюрные жиры, УФ-лампы, инструктажи и ещё 8",
  },
  {
    icon: Bell,
    title: "Мгновенные уведомления",
    description:
      "Telegram и email уведомления при нарушениях температуры. Напоминания о незаполненных журналах",
  },
  {
    icon: FileText,
    title: "PDF для проверяющих",
    description:
      "Формируйте отчёты для Роспотребнадзора и аудиторов одним кликом — за любой период",
  },
  {
    icon: Zap,
    title: "Быстрый старт",
    description:
      "Регистрация за 2 минуты. Все шаблоны журналов уже настроены по ГОСТ и СанПиН",
  },
  {
    icon: Lock,
    title: "Ролевой доступ",
    description:
      "Владелец, технолог, оператор — каждый видит только то, что ему нужно",
  },
  {
    icon: BarChart3,
    title: "Аналитика в реальном времени",
    description:
      "Дашборд с ключевыми метриками: записи за сегодня, нарушения, статистика по журналам",
  },
];

const hardwareItems = [
  {
    icon: Tablet,
    title: "Промышленный планшет",
    description: "10\" Android-планшет с предустановленным приложением HACCP-Online. Работает в перчатках, защита от влаги.",
  },
  {
    icon: ThermometerSun,
    title: "WiFi-датчики температуры",
    description: "Автоматический мониторинг холодильников и морозильников каждые 15 минут. Алерты при отклонениях.",
  },
  {
    icon: ScanBarcode,
    title: "Bluetooth сканер штрих-кодов",
    description: "Мгновенная приёмка сырья — сканируете штрих-код, данные заполняются автоматически.",
  },
];

const benefits = [
  { value: "300 000", label: "руб/год", description: "экономия на штрафах" },
  { value: "80%", label: "", description: "меньше времени на отчётность" },
  { value: "2", label: "минуты", description: "на регистрацию и старт" },
  { value: "24/7", label: "", description: "контроль температуры" },
];

const plans = [
  {
    name: "Стартовый",
    price: "3 000",
    features: ["До 3 пользователей", "Базовые журналы", "Email-поддержка"],
  },
  {
    name: "Стандарт",
    price: "5 000",
    popular: true,
    features: [
      "До 10 пользователей",
      "Все журналы",
      "Telegram-уведомления",
      "PDF-отчёты",
    ],
  },
  {
    name: "Про",
    price: "8 000",
    features: [
      "Безлимит пользователей",
      "Все журналы",
      "Приоритетная поддержка",
      "API-доступ",
    ],
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="size-6 text-primary" />
            <span className="text-lg font-bold tracking-tight">
              HACCP-Online
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm sm:flex">
            <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">Возможности</a>
            <a href="#hardware" className="text-muted-foreground transition-colors hover:text-foreground">Оборудование</a>
            <a href="#pricing" className="text-muted-foreground transition-colors hover:text-foreground">Тарифы</a>
          </nav>
          <nav className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Войти</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Попробовать бесплатно</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden py-20 sm:py-28">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_60%,hsl(var(--primary)/0.08),transparent)]" />
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm text-muted-foreground">
              <ThermometerSun className="size-4" />
              Соответствует СанПиН 2.3/2.4.3590-20
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Электронные журналы ХАССП
              <span className="mt-2 block bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                для пищевых производств
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Единственное решение в России: ПО + преднастроенное оборудование «под ключ».
              Планшет, датчики температуры, сканер штрих-кодов — подключите и работайте.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" asChild className="h-12 px-8 text-base">
                <Link href="/register">
                  Попробовать бесплатно — 14 дней
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
                <a href="#hardware">
                  Узнать про оборудование
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 divide-x divide-border lg:grid-cols-4">
              {benefits.map((b) => (
                <div key={b.description} className="px-4 py-8 text-center sm:px-6 sm:py-10">
                  <div className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                    {b.value}
                    {b.label && <span className="ml-1 text-base font-normal text-muted-foreground">{b.label}</span>}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{b.description}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* USP — Hardware Bundle */}
        <section id="hardware" className="relative overflow-hidden py-20 sm:py-24">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_80%_30%,hsl(var(--primary)/0.06),transparent)]" />
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                <PackageCheck className="size-4" />
                Уникальное предложение
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Всё оборудование —
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> под ключ</span>
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Мы единственные в России, кто предоставляет полный комплект преднастроенного оборудования
                для электронного учёта по ХАССП. Подключите — и работайте с первого дня.
              </p>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {hardwareItems.map((item) => (
                <Card key={item.title} className="relative overflow-hidden border-2 transition-colors hover:border-primary/50">
                  <div className="absolute right-0 top-0 size-24 -translate-y-1/3 translate-x-1/3 rounded-full bg-primary/5" />
                  <CardHeader className="relative">
                    <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10">
                      <item.icon className="size-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{item.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {item.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <div className="mt-12 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 sm:p-8">
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Wifi className="size-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">Комплект &laquo;ХАССП Старт&raquo;</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Планшет + 2-4 WiFi-датчика + Bluetooth-сканер + онбординг-звонок 30 мин.
                    Всё преднастроено и готово к работе. Аренда от 7 000 руб/мес или покупка от 40 000 руб.
                  </p>
                </div>
                <Button asChild className="shrink-0">
                  <Link href="/register">Оставить заявку</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t bg-muted/40 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Всё для контроля безопасности
                <span className="block text-primary">пищевой продукции</span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Автоматизируйте ведение журналов ХАССП и будьте готовы к любой проверке
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card key={feature.title} className="group relative transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                      <feature.icon className="size-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Why Us */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
                Почему HACCP-Online?
              </h2>
              <div className="mt-12 space-y-8">
                {[
                  {
                    num: "01",
                    title: "Полный комплект под ключ",
                    text: "Не просто ПО, а готовое решение: планшет + датчики + сканер + софт. Ни один конкурент в России не предлагает связку «оборудование + программа».",
                  },
                  {
                    num: "02",
                    title: "Специализация на производствах",
                    text: "Мы создавали систему специально для пищевых производств — мясных, молочных, кондитерских, хлебобулочных цехов. Не адаптированный ресторанный софт.",
                  },
                  {
                    num: "03",
                    title: "Соответствие всем стандартам",
                    text: "ГОСТ Р 51705.1, ТР ТС 021/2011, СанПиН 2.3/2.4.3590-20 — все журналы соответствуют актуальным нормативам. PDF-отчёты готовы для Роспотребнадзора.",
                  },
                  {
                    num: "04",
                    title: "Окупаемость за 1 месяц",
                    text: "Штраф за отсутствие журналов — до 300 000 руб. Подписка — от 3 000 руб/мес. Один предотвращённый штраф окупает год использования.",
                  },
                ].map((item) => (
                  <div key={item.num} className="flex gap-5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                      {item.num}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t bg-muted/40 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Тарифы
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                14 дней бесплатно — полный доступ ко всем функциям
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={
                    plan.popular
                      ? "relative border-2 border-primary shadow-lg"
                      : "relative"
                  }
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-0.5 text-xs font-medium text-primary-foreground">
                      Популярный
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription>
                      <span className="text-3xl font-bold text-foreground">
                        {plan.price}
                      </span>{" "}
                      <span className="text-muted-foreground">руб/мес</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2">
                          <Check className="size-4 shrink-0 text-primary" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full"
                      variant={plan.popular ? "default" : "outline"}
                      asChild
                    >
                      <Link href="/register">Начать бесплатно</Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Готовы перейти на электронные журналы?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Начните бесплатный период прямо сейчас. Без привязки карты. Полный доступ на 14 дней.
            </p>
            <div className="mt-8">
              <Button size="lg" asChild className="h-12 px-10 text-base">
                <Link href="/register">
                  Начать бесплатно
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <Shield className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">HACCP-Online</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; 2026 HACCP-Online. Все права защищены.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
