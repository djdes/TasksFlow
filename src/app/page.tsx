import Link from "next/link";
import {
  Shield,
  Bell,
  FileText,
  ClipboardList,
  ThermometerSun,
  Check,
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
    title: "Электронные журналы",
    description:
      "5 ключевых журналов ХАССП: температурный режим, входной контроль, бракераж, гигиена, мониторинг ККТ",
  },
  {
    icon: Bell,
    title: "Мгновенные уведомления",
    description:
      "Telegram и email уведомления при нарушениях. Незаполненные журналы — напоминание вечером",
  },
  {
    icon: FileText,
    title: "PDF для проверяющих",
    description:
      "Формируйте отчёты для Роспотребнадзора и аудиторов одним кликом",
  },
];

const plans = [
  {
    name: "Стартовый",
    price: "3 000",
    features: ["До 3 пользователей", "Базовые журналы", "Email поддержка"],
  },
  {
    name: "Стандарт",
    price: "5 000",
    popular: true,
    features: [
      "До 10 пользователей",
      "Все журналы",
      "Telegram уведомления",
      "PDF отчёты",
    ],
  },
  {
    name: "Про",
    price: "8 000",
    features: [
      "Безлимит пользователей",
      "Все журналы",
      "Приоритетная поддержка",
      "API доступ",
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
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm text-muted-foreground">
              <ThermometerSun className="size-4" />
              Соответствует СанПиН 2.3/2.4.3590-20
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Электронные журналы ХАССП для пищевых производств
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Замените бумажные журналы на цифровые. Соответствует СанПиН
              2.3/2.4.3590-20. Экономьте до 300 000 руб/год на штрафах.
            </p>
            <div className="mt-10">
              <Button size="lg" asChild className="h-12 px-8 text-base">
                <Link href="/register">
                  Попробовать бесплатно — 14 дней
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-muted/40 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Всё для контроля безопасности пищевой продукции
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Автоматизируйте ведение журналов ХАССП и будьте готовы к любой
                проверке
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card key={feature.title} className="relative">
                  <CardHeader>
                    <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10">
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

        {/* Pricing */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Тарифы
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                Выберите подходящий тариф для вашего предприятия
              </p>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={
                    plan.popular
                      ? "relative border-primary shadow-md"
                      : "relative"
                  }
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
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
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          &copy; 2026 HACCP-Online. Все права защищены.
        </div>
      </footer>
    </div>
  );
}
