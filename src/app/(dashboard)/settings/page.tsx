import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Building2,
  CreditCard,
  KeyRound,
  Package,
  ScrollText,
  Settings2,
  Users,
  Wrench,
} from "lucide-react";
import { requireAuth, getActiveOrgId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { hasFullWorkspaceAccess } from "@/lib/role-access";

export const dynamic = "force-dynamic";

const settingsCards = [
  {
    title: "Цеха и участки",
    description: "Производственные зоны и помещения",
    href: "/settings/areas",
    icon: Building2,
    color: "#5566f6",
    bg: "#eef1ff",
  },
  {
    title: "Оборудование",
    description: "Холодильники, печи, датчики",
    href: "/settings/equipment",
    icon: Wrench,
    color: "#7a5cff",
    bg: "#f0edff",
  },
  {
    title: "Сотрудники",
    description: "Роли, доступы, приглашения",
    href: "/settings/users",
    icon: Users,
    color: "#0ea5e9",
    bg: "#e8f7ff",
  },
  {
    title: "Справочник продуктов",
    description: "Импорт из Excel, iiko, 1С",
    href: "/settings/products",
    icon: Package,
    color: "#f59e0b",
    bg: "#fff8eb",
  },
  {
    title: "Уведомления",
    description: "Telegram-бот, типы оповещений",
    href: "/settings/notifications",
    icon: Bell,
    color: "#10b981",
    bg: "#ecfdf5",
  },
  {
    title: "Подписка",
    description: "Тариф и период подписки",
    href: "/settings/subscription",
    icon: CreditCard,
    color: "#ec4899",
    bg: "#fdf2f8",
  },
  {
    title: "Журнал действий",
    description: "Аудит всех событий",
    href: "/settings/audit",
    icon: ScrollText,
    color: "#6b7280",
    bg: "#f3f4f6",
  },
  {
    title: "Справочник СанПиН",
    description: "Нормативы и требования",
    href: "/sanpin",
    icon: BookOpen,
    color: "#14b8a6",
    bg: "#f0fdfa",
  },
  {
    title: "API интеграций",
    description: "Ключ для внешних систем и датчиков",
    href: "/settings/api",
    icon: KeyRound,
    color: "#8b5cf6",
    bg: "#f5f3ff",
  },
];

export default async function SettingsPage() {
  const session = await requireAuth();
  if (!hasFullWorkspaceAccess(session.user)) {
    redirect("/journals");
  }
  const orgId = getActiveOrgId(session);

  const [areaCount, equipmentCount, userCount, productCount] =
    await Promise.all([
      db.area.count({ where: { organizationId: orgId } }),
      db.equipment.count({
        where: { area: { organizationId: orgId } },
      }),
      db.user.count({ where: { organizationId: orgId, isActive: true } }),
      db.product.count({ where: { organizationId: orgId, isActive: true } }),
    ]);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-[#ececf4] bg-[#0b1024] text-white shadow-[0_20px_60px_-30px_rgba(11,16,36,0.55)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[420px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-40 -right-32 size-[460px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at 30% 40%, black 40%, transparent 70%)",
          }}
        />
        <div className="relative z-10 p-8 md:p-10">
          <div className="flex items-start gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Settings2 className="size-6" />
            </div>
            <div>
              <h1 className="text-[clamp(1.5rem,2vw+1rem,2rem)] font-semibold leading-tight tracking-[-0.02em]">
                Настройки
              </h1>
              <p className="mt-1 text-[15px] text-white/70">
                {session.user.organizationName}
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatPill label="Цехов" value={areaCount} />
            <StatPill label="Оборудования" value={equipmentCount} />
            <StatPill label="Сотрудников" value={userCount} />
            <StatPill label="Продуктов" value={productCount} />
          </div>
        </div>
      </section>

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settingsCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group">
              <div className="flex h-full items-start gap-4 rounded-2xl border border-[#ececf4] bg-white px-5 py-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] transition-all hover:border-[#d6d9ee] hover:shadow-[0_8px_24px_-12px_rgba(85,102,246,0.18)]">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
                  style={{ backgroundColor: card.bg }}
                >
                  <Icon className="size-5" style={{ color: card.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[15px] font-semibold text-[#0b1024]">
                      {card.title}
                    </div>
                    <ArrowRight className="size-4 text-[#c7ccea] transition-all group-hover:translate-x-0.5 group-hover:text-[#5566f6]" />
                  </div>
                  <div className="mt-1 text-[13px] text-[#6f7282]">
                    {card.description}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="text-[24px] font-semibold leading-none tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[12px] text-white/60">{label}</div>
    </div>
  );
}
