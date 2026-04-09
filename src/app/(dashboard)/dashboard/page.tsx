import Link from "next/link";
import {
  ClipboardList,
  Users,
  ThermometerSun,
  Activity,
  Wifi,
  User as UserIcon,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertCircle,
  Plus,
  BookOpen,
  FileDown,
  Package,
  AlertTriangle,
  TrendingDown,
} from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { TemperatureChart } from "@/components/charts/temperature-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDateTime(date: Date): string {
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} д назад`;
}

type EntryData = Record<string, unknown>;

function getEntryData(data: unknown): EntryData {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as EntryData;
  }
  return {};
}

export default async function DashboardPage() {
  const session = await requireAuth();
  const organizationId = session.user.organizationId;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const [totalEntries, todayEntries, activeTemplates, activeUsers, pendingApproval, recentEntries] =
    await Promise.all([
      db.journalEntry.count({
        where: { organizationId },
      }),
      db.journalEntry.count({
        where: {
          organizationId,
          createdAt: { gte: todayStart },
        },
      }),
      db.journalTemplate.count({
        where: { isActive: true },
      }),
      db.user.count({
        where: { organizationId, isActive: true },
      }),
      db.journalEntry.count({
        where: { organizationId, status: "submitted" },
      }),
      db.journalEntry.findMany({
        where: {
          organizationId,
          createdAt: { gte: cutoff48h },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          template: { select: { name: true, code: true } },
          filledBy: { select: { name: true } },
          area: { select: { name: true } },
          equipment: { select: { name: true } },
        },
      }),
    ]);

  const templates = await db.journalTemplate.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  // New module stats
  const [openCapaCount, weekLossCount, expiringBatches] = await Promise.all([
    db.capaTicket.count({
      where: { organizationId, status: { not: "closed" } },
    }),
    db.lossRecord.count({
      where: { organizationId, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    db.batch.count({
      where: {
        organizationId,
        expiryDate: { lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["expired", "written_off", "shipped"] },
      },
    }),
  ]);

  // Equipment with IoT for temperature chart
  const iotEquipment = await db.equipment.findMany({
    where: {
      area: { organizationId },
      tuyaDeviceId: { not: null },
    },
    select: { id: true, name: true, tuyaDeviceId: true },
  });

  // Compliance: check which mandatory journals are filled today
  const mandatoryTemplates = templates.filter(
    (t) => t.isMandatorySanpin || t.isMandatoryHaccp
  );
  const filledTemplateIds = new Set(
    recentEntries
      .filter((e) => e.createdAt >= todayStart)
      .map((e) => e.template.code)
  );
  // Also check from a direct query to be accurate
  const todayFilledEntries = await db.journalEntry.findMany({
    where: {
      organizationId,
      createdAt: { gte: todayStart },
    },
    select: { templateId: true },
    distinct: ["templateId"],
  });
  const filledTodayIds = new Set(todayFilledEntries.map((e) => e.templateId));
  const complianceItems = mandatoryTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    filled: filledTodayIds.has(t.id),
    isSanpin: t.isMandatorySanpin,
    isHaccp: t.isMandatoryHaccp,
  }));
  const filledCount = complianceItems.filter((c) => c.filled).length;
  const compliancePercent = mandatoryTemplates.length > 0
    ? Math.round((filledCount / mandatoryTemplates.length) * 100)
    : 100;

  const stats = [
    {
      title: "Записей сегодня",
      value: todayEntries,
      icon: ClipboardList,
    },
    {
      title: "На проверке",
      value: pendingApproval,
      icon: AlertCircle,
      highlight: pendingApproval > 0,
    },
    {
      title: "Сотрудников",
      value: activeUsers,
      icon: Users,
    },
    {
      title: "Журналов",
      value: activeTemplates,
      icon: ThermometerSun,
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Дашборд</h1>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className={stat.highlight ? "border-orange-300 bg-orange-50" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`size-4 ${stat.highlight ? "text-orange-500" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stat.highlight ? "text-orange-600" : ""}`}>{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <Link href="/journals">
            <Plus className="size-4" />
            Новая запись
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/reports">
            <FileDown className="size-4" />
            Отчёт
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/sanpin">
            <BookOpen className="size-4" />
            Справочник СанПиН
          </Link>
        </Button>
      </div>

      {/* Operations alerts */}
      {(openCapaCount > 0 || expiringBatches > 0 || weekLossCount > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {openCapaCount > 0 && (
            <Link href="/capa">
              <Card className="border-red-200 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-3 p-4">
                  <AlertTriangle className="size-8 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold text-red-600">{openCapaCount}</p>
                    <p className="text-xs text-red-700">Открытых CAPA</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {expiringBatches > 0 && (
            <Link href="/batches?status=received">
              <Card className="border-yellow-200 bg-yellow-50 hover:bg-yellow-100 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-3 p-4">
                  <Package className="size-8 text-yellow-600" />
                  <div>
                    <p className="text-2xl font-bold text-yellow-700">{expiringBatches}</p>
                    <p className="text-xs text-yellow-700">Партий истекает</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {weekLossCount > 0 && (
            <Link href="/losses">
              <Card className="border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-3 p-4">
                  <TrendingDown className="size-8 text-orange-500" />
                  <div>
                    <p className="text-2xl font-bold text-orange-600">{weekLossCount}</p>
                    <p className="text-xs text-orange-700">Потерь за неделю</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* Compliance traffic light */}
      {mandatoryTemplates.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">Соответствие за сегодня</CardTitle>
              </div>
              <div className={`text-2xl font-bold ${
                compliancePercent === 100 ? "text-green-600" :
                compliancePercent >= 50 ? "text-yellow-600" : "text-red-600"
              }`}>
                {compliancePercent}%
              </div>
            </div>
            <CardDescription>
              Заполнено {filledCount} из {mandatoryTemplates.length} обязательных журналов
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {complianceItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.filled ? `/journals/${item.code}` : `/journals/${item.code}/new`}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                    item.filled
                      ? "border-green-200 bg-green-50 hover:bg-green-100"
                      : "border-red-200 bg-red-50 hover:bg-red-100"
                  }`}
                >
                  {item.filled ? (
                    <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-red-500" />
                  )}
                  <span className={item.filled ? "text-green-800" : "text-red-800"}>
                    {item.name}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Temperature chart */}
      {iotEquipment.length > 0 && (
        <TemperatureChart equipmentList={iotEquipment} />
      )}

      {/* Last 48 hours activity */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Activity className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Активность за 48 часов</h2>
          <Badge variant="secondary" className="ml-1">
            {recentEntries.length}
          </Badge>
        </div>

        {recentEntries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="size-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                За последние 48 часов записей не было
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Когда</TableHead>
                    <TableHead>Журнал</TableHead>
                    <TableHead>Детали</TableHead>
                    <TableHead>Участок</TableHead>
                    <TableHead>Кто</TableHead>
                    <TableHead>Источник</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEntries.map((entry) => {
                    const data = getEntryData(entry.data);
                    const source = data.source as string | undefined;
                    const isIoT = source === "tuya_auto" || source === "tuya_sensor";
                    const temp = data.temperature as number | undefined;
                    const isTempControl = entry.template.code === "temp_control";

                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="text-sm font-medium">
                            {formatDateTime(entry.createdAt)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatRelativeTime(entry.createdAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/journals/${entry.template.code}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {entry.template.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {isTempControl && temp != null ? (
                            <div className="space-y-0.5">
                              {entry.equipment && (
                                <div className="text-xs text-muted-foreground">
                                  {entry.equipment.name}
                                </div>
                              )}
                              <span className="font-mono font-semibold">
                                {temp}°C
                              </span>
                            </div>
                          ) : entry.equipment ? (
                            <span className="text-sm">{entry.equipment.name}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.area?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <UserIcon className="size-3 text-muted-foreground" />
                            <span className="text-sm">{entry.filledBy.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isIoT ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              <Wifi className="size-3" />
                              {source === "tuya_auto" ? "Авто" : "Датчик"}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Вручную
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.status === "draft" && (
                            <Badge variant="outline">Черновик</Badge>
                          )}
                          {entry.status === "submitted" && (
                            <Badge variant="secondary">Отправлено</Badge>
                          )}
                          {entry.status === "approved" && (
                            <Badge variant="default">Утверждено</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Journal template cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Журналы</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Link key={template.id} href={`/journals/${template.code}`}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  {template.description && (
                    <CardDescription>{template.description}</CardDescription>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
