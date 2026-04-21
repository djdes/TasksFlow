"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, QrCode, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Employee = { id: string; name: string; positionTitle: string | null };

type Props = {
  token: string;
  equipment: {
    id: string;
    name: string;
    tempMin: number | null;
    tempMax: number | null;
    areaName: string;
  };
  employees: Employee[];
};

const LS_EMPLOYEE_KEY = "wesetup.equipment-fill.employeeId";

/**
 * Worker scans the sticker → lands here. First scan: pick your name
 * (stored in localStorage so every subsequent scan skips the picker).
 * Enter temperature → hit «Сохранить». Done in 8 seconds.
 */
export function EquipmentFillClient({ token, equipment, employees }: Props) {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [temperature, setTemperature] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the remembered employee pick on mount.
  useEffect(() => {
    const remembered = localStorage.getItem(LS_EMPLOYEE_KEY);
    if (remembered && employees.some((e) => e.id === remembered)) {
      setEmployeeId(remembered);
    }
  }, [employees]);

  const rangeLabel = useMemo(() => {
    const { tempMin, tempMax } = equipment;
    if (tempMin != null && tempMax != null)
      return `норма ${tempMin}…${tempMax} °C`;
    if (tempMin != null) return `норма от ${tempMin} °C`;
    if (tempMax != null) return `норма до ${tempMax} °C`;
    return "норма не задана";
  }, [equipment]);

  const parsedTemp = useMemo(() => {
    const n = Number(temperature.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }, [temperature]);

  const outOfRange = useMemo(() => {
    if (parsedTemp === null) return false;
    if (equipment.tempMin != null && parsedTemp < equipment.tempMin) return true;
    if (equipment.tempMax != null && parsedTemp > equipment.tempMax) return true;
    return false;
  }, [parsedTemp, equipment]);

  const rememberedName = employees.find((e) => e.id === employeeId)?.name ?? null;

  async function save() {
    if (submitting) return;
    setError(null);
    if (!employeeId) {
      setError("Выберите имя");
      return;
    }
    if (parsedTemp === null) {
      setError("Введите температуру");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/equipment-fill/${equipment.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            employeeId,
            temperature: parsedTemp,
          }),
        }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Ошибка сохранения");
      }
      localStorage.setItem(LS_EMPLOYEE_KEY, employeeId);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fafbff]">
      <section className="relative overflow-hidden bg-[#0b1024] text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 size-[420px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
          <div className="absolute -bottom-40 -right-32 size-[460px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-xl px-5 py-10">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <QrCode className="size-5" />
            </div>
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Замер температуры
              </div>
              <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
                {equipment.name}
              </h1>
              <p className="mt-2 text-[14px] text-white/75">
                {equipment.areaName} · {rangeLabel}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-xl px-5 py-8">
        {done ? (
          <div className="rounded-3xl border border-[#ececf4] bg-white p-8 text-center shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#ecfdf5] text-[#116b2a]">
              <CheckCircle2 className="size-7" />
            </div>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0b1024]">
              Записано
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6f7282]">
              Температура {parsedTemp}°C сохранена в журнал{" "}
              {rememberedName ? `на имя ${rememberedName}` : ""}.
            </p>
            <Button
              type="button"
              onClick={() => {
                setDone(false);
                setTemperature("");
                setError(null);
              }}
              className="mt-6 h-12 rounded-2xl bg-[#5566f6] px-5 text-[15px] font-medium text-white hover:bg-[#4a5bf0]"
            >
              Записать ещё замер
            </Button>
          </div>
        ) : (
          <div className="rounded-3xl border border-[#ececf4] bg-white p-6 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
            <div className="space-y-5">
              <div>
                <label className="text-[13px] font-medium text-[#0b1024]">
                  Кто снимает показания
                </label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger className="mt-1 h-12 rounded-2xl border-[#dcdfed]">
                    <SelectValue placeholder="Выберите ваше имя" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                        {e.positionTitle ? ` · ${e.positionTitle}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rememberedName ? (
                  <p className="mt-1.5 text-[11px] text-[#9b9fb3]">
                    Запомнили с прошлого раза — можно сразу вводить температуру.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-[13px] font-medium text-[#0b1024]">
                  Температура, °C
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-[#f5f6ff] text-[#5566f6]">
                    <Thermometer className="size-5" />
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder={
                      equipment.tempMin != null && equipment.tempMax != null
                        ? `${equipment.tempMin}…${equipment.tempMax}`
                        : "0"
                    }
                    className="h-12 flex-1 rounded-2xl border-[#dcdfed] text-[18px]"
                  />
                </div>
                {parsedTemp !== null && outOfRange ? (
                  <p className="mt-2 rounded-2xl border border-[#ffd2cd] bg-[#fff4f2] p-3 text-[13px] text-[#a13a32]">
                    Значение вне нормы. Запишите в журнал, но сообщите
                    начальнику — возможно, требуется проверка оборудования.
                  </p>
                ) : null}
              </div>

              {error ? (
                <div className="rounded-2xl border border-[#ffd2cd] bg-[#fff4f2] p-3 text-[13px] text-[#a13a32]">
                  {error}
                </div>
              ) : null}

              <Button
                type="button"
                onClick={save}
                disabled={submitting || !employeeId || parsedTemp === null}
                className="h-12 w-full rounded-2xl bg-[#5566f6] px-5 text-[15px] font-medium text-white hover:bg-[#4a5bf0] shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] disabled:bg-[#c8cbe0]"
              >
                {submitting ? "Сохраняем…" : "Сохранить замер"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
