"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const equipmentTypes = [
  { value: "refrigerator", label: "Холодильник" },
  { value: "freezer", label: "Морозильник" },
  { value: "oven", label: "Печь" },
  { value: "other", label: "Другое" },
];

type AreaOption = {
  id: string;
  name: string;
};

interface EquipmentData {
  id: string;
  name: string;
  type: string;
  areaId: string;
  serialNumber: string | null;
  tempMin: number | null;
  tempMax: number | null;
  tuyaDeviceId: string | null;
}

interface EquipmentDialogProps {
  areas: AreaOption[];
  equipment?: EquipmentData;
}

export function EquipmentDialog({ areas, equipment }: EquipmentDialogProps) {
  const router = useRouter();
  const isEdit = !!equipment;
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(equipment?.name ?? "");
  const [type, setType] = useState(equipment?.type ?? "");
  const [areaId, setAreaId] = useState(equipment?.areaId ?? "");
  const [serialNumber, setSerialNumber] = useState(equipment?.serialNumber ?? "");
  const [tempMin, setTempMin] = useState(equipment?.tempMin?.toString() ?? "");
  const [tempMax, setTempMax] = useState(equipment?.tempMax?.toString() ?? "");
  const [tuyaDeviceId, setTuyaDeviceId] = useState(equipment?.tuyaDeviceId ?? "");

  function resetForm() {
    setName(equipment?.name ?? "");
    setType(equipment?.type ?? "");
    setAreaId(equipment?.areaId ?? "");
    setSerialNumber(equipment?.serialNumber ?? "");
    setTempMin(equipment?.tempMin?.toString() ?? "");
    setTempMax(equipment?.tempMax?.toString() ?? "");
    setTuyaDeviceId(equipment?.tuyaDeviceId ?? "");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const url = isEdit ? `/api/equipment/${equipment.id}` : "/api/equipment";
      const response = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          areaId,
          serialNumber: serialNumber || undefined,
          tempMin: tempMin !== "" ? Number(tempMin) : undefined,
          tempMax: tempMax !== "" ? Number(tempMax) : undefined,
          tuyaDeviceId: tuyaDeviceId || undefined,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Ошибка при создании");
      }

      if (!isEdit) resetForm();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) resetForm();
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm"><Pencil className="size-4" /></Button>
        ) : (
          <Button><Plus className="size-4" />Добавить оборудование</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать оборудование" : "Добавить оборудование"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="eq-name">
              Название <span className="text-destructive">*</span>
            </Label>
            <Input
              id="eq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Холодильник Samsung"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eq-type">
              Тип <span className="text-destructive">*</span>
            </Label>
            <Select value={type} onValueChange={setType} required>
              <SelectTrigger id="eq-type" className="w-full">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                {equipmentTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eq-area">
              Цех / участок <span className="text-destructive">*</span>
            </Label>
            <Select value={areaId} onValueChange={setAreaId} required>
              <SelectTrigger id="eq-area" className="w-full">
                <SelectValue placeholder="Выберите цех" />
              </SelectTrigger>
              <SelectContent>
                {areas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eq-serial">Серийный номер</Label>
            <Input
              id="eq-serial"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="Серийный номер"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eq-temp-min">Мин. температура</Label>
              <Input
                id="eq-temp-min"
                type="number"
                step="0.1"
                value={tempMin}
                onChange={(e) => setTempMin(e.target.value)}
                placeholder="°C"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eq-temp-max">Макс. температура</Label>
              <Input
                id="eq-temp-max"
                type="number"
                step="0.1"
                value={tempMax}
                onChange={(e) => setTempMax(e.target.value)}
                placeholder="°C"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eq-tuya">Tuya Device ID (IoT-датчик)</Label>
            <Input
              id="eq-tuya"
              value={tuyaDeviceId}
              onChange={(e) => setTuyaDeviceId(e.target.value)}
              placeholder="например: bf397860f79b0963a0nakc"
            />
            <p className="text-xs text-muted-foreground">
              Если подключён WiFi-датчик температуры Tuya, укажите его Device ID
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
