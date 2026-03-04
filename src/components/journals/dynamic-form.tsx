"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wifi, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoCapture, type OcrResult } from "./photo-capture";

type FieldOption = { value: string; label: string };
type ShowIfCondition = { field: string; equals: unknown };

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select" | "equipment" | "employee";
  required?: boolean;
  options?: FieldOption[];
  step?: number;
  auto?: boolean;
  showIf?: ShowIfCondition;
};

type EquipmentItem = {
  id: string;
  name: string;
  type: string;
  tempMin: number | null;
  tempMax: number | null;
  tuyaDeviceId?: string | null;
};

type AreaItem = {
  id: string;
  name: string;
};

type EmployeeItem = {
  id: string;
  name: string;
};

interface DynamicFormProps {
  templateCode: string;
  templateName: string;
  fields: FieldDef[];
  areas: AreaItem[];
  equipment: EquipmentItem[];
  employees?: EmployeeItem[];
}

export function DynamicForm({
  templateCode,
  templateName,
  fields,
  areas,
  equipment,
  employees = [],
}: DynamicFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [areaId, setAreaId] = useState<string>("");
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFetchingSensor, setIsFetchingSensor] = useState(false);
  const [sensorInfo, setSensorInfo] = useState<{
    temperature: number;
    humidity: number | null;
    timestamp: string;
  } | null>(null);

  const selectedEquipment = equipment.find((e) => e.id === equipmentId);
  const hasSensor = !!selectedEquipment?.tuyaDeviceId;

  // Check if this template supports photo OCR
  const supportsPhotoOcr = templateCode === "incoming_control";

  function updateField(key: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function updateMultipleFields(updates: Record<string, unknown>) {
    setFormData((prev) => ({ ...prev, ...updates }));
  }

  function isFieldVisible(field: FieldDef): boolean {
    if (!field.showIf) return true;
    return formData[field.showIf.field] === field.showIf.equals;
  }

  async function fetchFromSensor() {
    if (!equipmentId) return;
    setIsFetchingSensor(true);
    setError(null);
    setSensorInfo(null);

    try {
      const res = await fetch(
        `/api/tuya/device?equipmentId=${equipmentId}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ошибка получения данных с датчика");
      }

      updateField("temperature", data.temperature);
      updateField("source", "tuya_sensor");

      setSensorInfo({
        temperature: data.temperature,
        humidity: data.humidity,
        timestamp: data.timestamp,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Ошибка получения данных"
      );
    } finally {
      setIsFetchingSensor(false);
    }
  }

  // Handle OCR result — auto-fill form fields from photo
  function handleOcrResult(result: OcrResult) {
    const updates: Record<string, unknown> = {};

    if (result.productName) updates.productName = result.productName;
    if (result.supplier) updates.supplier = result.supplier;
    if (result.manufactureDate) updates.manufactureDate = result.manufactureDate;
    if (result.expiryDate) updates.expiryDate = result.expiryDate;
    if (result.quantity) updates.quantity = result.quantity;
    if (result.unit) updates.unit = result.unit;
    if (result.batchNumber) updates.batchNumber = result.batchNumber;

    // Save OCR metadata
    updates.ocrUsed = true;
    updates.ocrConfidence = result.confidence;
    if (result.barcode) updates.barcode = result.barcode;
    if (result.storageTemp) updates.storageTemp = result.storageTemp;
    if (result.composition) updates.composition = result.composition;

    updateMultipleFields(updates);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateCode,
          areaId: areaId || undefined,
          equipmentId: equipmentId || undefined,
          data: formData,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Ошибка при сохранении");
      }

      router.push(`/journals/${templateCode}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка при сохранении");
    } finally {
      setIsSubmitting(false);
    }
  }

  const visibleFields = fields.filter(
    (field) => !field.auto && isFieldVisible(field)
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Photo OCR for incoming control */}
      {supportsPhotoOcr && (
        <div className="space-y-2">
          <Label>Распознать с фото</Label>
          <PhotoCapture onResult={handleOcrResult} />
        </div>
      )}

      {areas.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="area">Участок</Label>
          <Select value={areaId} onValueChange={setAreaId}>
            <SelectTrigger id="area" className="w-full">
              <SelectValue placeholder="Выберите участок" />
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
      )}

      {visibleFields.map((field) => (
        <div key={field.key} className="space-y-2">
          {field.type === "boolean" ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id={field.key}
                checked={!!formData[field.key]}
                onCheckedChange={(checked) =>
                  updateField(field.key, checked === true)
                }
              />
              <Label htmlFor={field.key}>{field.label}</Label>
            </div>
          ) : (
            <>
              <Label htmlFor={field.key}>
                {field.label}
                {field.required && (
                  <span className="text-destructive"> *</span>
                )}
              </Label>

              {field.type === "text" && (
                <Textarea
                  id={field.key}
                  value={(formData[field.key] as string) ?? ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  required={field.required}
                />
              )}

              {field.type === "number" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      id={field.key}
                      type="number"
                      step={field.step ?? 1}
                      value={(formData[field.key] as string) ?? ""}
                      onChange={(e) =>
                        updateField(
                          field.key,
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      required={field.required}
                    />
                    {field.key === "temperature" && hasSensor && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={fetchFromSensor}
                        disabled={isFetchingSensor}
                        className="shrink-0"
                      >
                        {isFetchingSensor ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Wifi className="size-4" />
                        )}
                        {isFetchingSensor ? "Получение..." : "С датчика"}
                      </Button>
                    )}
                  </div>
                  {sensorInfo && field.key === "temperature" && (
                    <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-green-800">
                        <Wifi className="size-4" />
                        Данные получены с IoT-датчика
                      </div>
                      <div className="mt-2 space-y-1 text-green-700">
                        <p>
                          Температура:{" "}
                          <strong>{sensorInfo.temperature}°C</strong>
                        </p>
                        {sensorInfo.humidity !== null && (
                          <p>
                            Влажность:{" "}
                            <strong>{sensorInfo.humidity}%</strong>
                          </p>
                        )}
                        <p className="text-xs text-green-600">
                          {new Date(sensorInfo.timestamp).toLocaleString(
                            "ru-RU"
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {field.type === "date" && (
                <Input
                  id={field.key}
                  type="date"
                  value={(formData[field.key] as string) ?? ""}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  required={field.required}
                />
              )}

              {field.type === "select" && field.options && (
                <Select
                  value={(formData[field.key] as string) ?? ""}
                  onValueChange={(value) => updateField(field.key, value)}
                  required={field.required}
                >
                  <SelectTrigger id={field.key} className="w-full">
                    <SelectValue placeholder="Выберите..." />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {field.type === "equipment" && (
                <Select
                  value={equipmentId}
                  onValueChange={(value) => {
                    setEquipmentId(value);
                    updateField(field.key, value);
                    setSensorInfo(null);
                  }}
                  required={field.required}
                >
                  <SelectTrigger id={field.key} className="w-full">
                    <SelectValue placeholder="Выберите оборудование" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.tuyaDeviceId && " (IoT)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {field.type === "employee" && (
                <Select
                  value={(formData[field.key] as string) ?? ""}
                  onValueChange={(value) => updateField(field.key, value)}
                  required={field.required}
                >
                  <SelectTrigger id={field.key} className="w-full">
                    <SelectValue placeholder="Выберите сотрудника" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.name}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </>
          )}
        </div>
      ))}

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Сохранение..." : "Сохранить запись"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/journals/${templateCode}`)}
          disabled={isSubmitting}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
