import { Wrench, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EquipmentDialog } from "@/components/settings/equipment-dialog";
import { DeleteButton } from "@/components/settings/delete-button";

const equipmentTypeLabels: Record<string, string> = {
  refrigerator: "Холодильник",
  freezer: "Морозильник",
  oven: "Печь",
  dishwasher: "Посудомоечная машина",
  scale: "Весы",
  thermometer: "Термометр",
  other: "Другое",
};

function formatTempRange(
  tempMin: number | null,
  tempMax: number | null
): string {
  if (tempMin !== null && tempMax !== null) {
    return `${tempMin}°C ... ${tempMax}°C`;
  }
  if (tempMin !== null) {
    return `от ${tempMin}°C`;
  }
  if (tempMax !== null) {
    return `до ${tempMax}°C`;
  }
  return "—";
}

export default async function EquipmentSettingsPage() {
  const session = await requireAuth();

  const equipment = await db.equipment.findMany({
    where: {
      area: { organizationId: session.user.organizationId },
    },
    orderBy: { name: "asc" },
    include: {
      area: { select: { id: true, name: true } },
    },
  });

  const areas = await db.area.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Get last IoT reading for each equipment with Tuya device
  const iotEquipmentIds = equipment
    .filter((e) => e.tuyaDeviceId)
    .map((e) => e.id);

  const lastReadings: Record<string, { temp: number; time: Date }> = {};
  if (iotEquipmentIds.length > 0) {
    for (const eqId of iotEquipmentIds) {
      const lastEntry = await db.journalEntry.findFirst({
        where: {
          equipmentId: eqId,
          data: { path: ["source"], string_contains: "tuya" },
        },
        orderBy: { createdAt: "desc" },
        select: { data: true, createdAt: true },
      });
      if (lastEntry && lastEntry.data && typeof lastEntry.data === "object") {
        const d = lastEntry.data as Record<string, unknown>;
        if (d.temperature != null) {
          lastReadings[eqId] = {
            temp: Number(d.temperature),
            time: lastEntry.createdAt,
          };
        }
      }
    }
  }

  const canManage = ["owner", "technologist"].includes(session.user.role);
  const canDelete = session.user.role === "owner";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Оборудование</h1>
          <p className="mt-1 text-muted-foreground">
            Управление оборудованием организации
          </p>
        </div>
        {canManage && <EquipmentDialog areas={areas} />}
      </div>

      {equipment.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Wrench className="size-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Оборудования пока нет</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Добавьте первое оборудование
          </p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Цех</TableHead>
                <TableHead>Температурный диапазон</TableHead>
                <TableHead>Серийный номер</TableHead>
                <TableHead>IoT</TableHead>
                {canDelete && <TableHead className="w-[70px]">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipment.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    {equipmentTypeLabels[item.type] ?? item.type}
                  </TableCell>
                  <TableCell>{item.area.name}</TableCell>
                  <TableCell>
                    {formatTempRange(item.tempMin, item.tempMax)}
                  </TableCell>
                  <TableCell>{item.serialNumber ?? "—"}</TableCell>
                  <TableCell>
                    {item.tuyaDeviceId ? (() => {
                      const reading = lastReadings[item.id];
                      if (!reading) {
                        return (
                          <div className="flex items-center gap-1.5">
                            <WifiOff className="size-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Нет данных</span>
                          </div>
                        );
                      }
                      const minutesAgo = Math.round((Date.now() - reading.time.getTime()) / 60000);
                      const isOnline = minutesAgo <= 120; // 2 hours = online
                      const isOutOfRange =
                        (item.tempMin != null && reading.temp < item.tempMin) ||
                        (item.tempMax != null && reading.temp > item.tempMax);
                      return (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {isOnline ? (
                              <Wifi className="size-3 text-green-600" />
                            ) : (
                              <WifiOff className="size-3 text-red-500" />
                            )}
                            <Badge variant={isOnline ? "secondary" : "destructive"} className="text-[10px] px-1.5 py-0 h-4">
                              {isOnline ? "Online" : "Offline"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            {isOutOfRange && <AlertTriangle className="size-3 text-red-500" />}
                            <span className={`text-xs font-mono font-semibold ${isOutOfRange ? "text-red-600" : "text-green-700"}`}>
                              {reading.temp}°C
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {minutesAgo < 60
                              ? `${minutesAgo} мин назад`
                              : minutesAgo < 1440
                                ? `${Math.floor(minutesAgo / 60)} ч назад`
                                : `${Math.floor(minutesAgo / 1440)} д назад`}
                          </span>
                        </div>
                      );
                    })() : "—"}
                  </TableCell>
                  {canDelete && (
                    <TableCell>
                      <DeleteButton
                        id={item.id}
                        endpoint="/api/equipment"
                        entityName={`оборудование "${item.name}"`}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
