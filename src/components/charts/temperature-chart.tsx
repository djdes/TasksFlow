"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EquipmentItem {
  id: string;
  name: string;
  tuyaDeviceId: string | null;
}

interface TemperaturePoint {
  time: string;
  temperature: number;
  humidity: number | null;
}

interface ChartData {
  points: TemperaturePoint[];
  equipment: {
    name: string;
    tempMin: number | null;
    tempMax: number | null;
  };
}

type Period = "24h" | "7d" | "30d";

const PERIOD_LABELS: Record<Period, string> = {
  "24h": "24\u0447",
  "7d": "7\u0434",
  "30d": "30\u0434",
};

function formatTime(isoString: string, period: Period): string {
  const date = new Date(isoString);
  if (period === "24h") {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface TemperatureChartProps {
  equipmentList: EquipmentItem[];
}

export function TemperatureChart({ equipmentList }: TemperatureChartProps) {
  const connectedEquipment = equipmentList.filter(
    (eq) => eq.tuyaDeviceId != null
  );

  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>(
    connectedEquipment[0]?.id ?? ""
  );
  const [period, setPeriod] = useState<Period>("24h");
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasHumidity =
    data?.points.some((p) => p.humidity != null) ?? false;

  const fetchData = useCallback(async () => {
    if (!selectedEquipmentId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/charts/temperature?equipmentId=${encodeURIComponent(selectedEquipmentId)}&period=${period}`
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error || "Ошибка загрузки данных"
        );
      }

      const json: ChartData = await res.json();
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка загрузки данных"
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedEquipmentId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartPoints = data?.points.map((p) => ({
    ...p,
    time: formatTime(p.time, period),
  }));

  if (connectedEquipment.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Температурный график</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Нет оборудования с подключёнными IoT-датчиками.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Температурный график</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Select
            value={selectedEquipmentId}
            onValueChange={setSelectedEquipmentId}
          >
            <SelectTrigger className="w-full sm:w-[260px]">
              <SelectValue placeholder="Выберите оборудование" />
            </SelectTrigger>
            <SelectContent>
              {connectedEquipment.map((eq) => (
                <SelectItem key={eq.id} value={eq.id}>
                  {eq.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tabs
            value={period}
            onValueChange={(v) => setPeriod(v as Period)}
          >
            <TabsList>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {PERIOD_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Chart area */}
        {loading && (
          <div className="flex h-[300px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex h-[300px] items-center justify-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!loading && !error && data && chartPoints && (
          <>
            {chartPoints.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Нет данных за выбранный период.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={chartPoints}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    domain={["auto", "auto"]}
                    unit="\u00B0C"
                  />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      const v = Number(value ?? 0);
                      if (name === "temperature") return [`${v}°C`, "Температура"];
                      if (name === "humidity") return [`${v}%`, "Влажность"];
                      return [v, String(name)];
                    }}
                  />

                  {/* Temperature line */}
                  <Line
                    type="monotone"
                    dataKey="temperature"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    name="temperature"
                  />

                  {/* Humidity line (optional) */}
                  {hasHumidity && (
                    <Line
                      type="monotone"
                      dataKey="humidity"
                      stroke="#22c55e"
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      dot={false}
                      activeDot={{ r: 3 }}
                      name="humidity"
                    />
                  )}

                  {/* Min temperature reference line */}
                  {data.equipment.tempMin != null && (
                    <ReferenceLine
                      y={data.equipment.tempMin}
                      stroke="#ef4444"
                      strokeDasharray="6 4"
                      label={{
                        value: `min ${data.equipment.tempMin}\u00B0C`,
                        position: "insideTopLeft",
                        fill: "#ef4444",
                        fontSize: 11,
                      }}
                    />
                  )}

                  {/* Max temperature reference line */}
                  {data.equipment.tempMax != null && (
                    <ReferenceLine
                      y={data.equipment.tempMax}
                      stroke="#ef4444"
                      strokeDasharray="6 4"
                      label={{
                        value: `max ${data.equipment.tempMax}\u00B0C`,
                        position: "insideBottomLeft",
                        fill: "#ef4444",
                        fontSize: 11,
                      }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
