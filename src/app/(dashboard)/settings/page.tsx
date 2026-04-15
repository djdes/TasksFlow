import Link from "next/link";
import { Building2, Wrench, Users, Bell, Package, CreditCard, ScrollText, BookOpen, KeyRound } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const settingsCards = [
  {
    title: "Цеха и участки",
    description: "Управление производственными зонами и участками",
    href: "/settings/areas",
    icon: Building2,
  },
  {
    title: "Оборудование",
    description: "Управление оборудованием по цехам и участкам",
    href: "/settings/equipment",
    icon: Wrench,
  },
  {
    title: "Сотрудники",
    description: "Управление сотрудниками и их ролями",
    href: "/settings/users",
    icon: Users,
  },
  {
    title: "Справочник продуктов",
    description: "Импорт товаров из Excel, iiko, 1С",
    href: "/settings/products",
    icon: Package,
  },
  {
    title: "Уведомления",
    description: "Настройка Telegram-уведомлений",
    href: "/settings/notifications",
    icon: Bell,
  },
  {
    title: "Подписка",
    description: "Управление тарифом и оплатой",
    href: "/settings/subscription",
    icon: CreditCard,
  },
  {
    title: "Журнал действий",
    description: "Аудит всех действий в системе",
    href: "/settings/audit",
    icon: ScrollText,
  },
  {
    title: "Справочник СанПиН",
    description: "Нормативы температуры, сроков, гигиены",
    href: "/sanpin",
    icon: BookOpen,
  },
  {
    title: "API интеграций",
    description: "Ключ для внешнего приложения и сенсоров",
    href: "/settings/api",
    icon: KeyRound,
  },
];

export default async function SettingsPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="mt-1 text-muted-foreground">
          Управление организацией, оборудованием и сотрудниками
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settingsCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <card.icon className="size-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{card.title}</CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
