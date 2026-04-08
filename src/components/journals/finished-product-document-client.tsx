"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createFinishedProductRow,
  normalizeFinishedProductDocumentConfig,
  type FinishedProductDocumentConfig,
} from "@/lib/finished-product-document";

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  initialConfig: FinishedProductDocumentConfig;
  users: { id: string; name: string; role: string }[];
};

const COLUMNS: Array<{ key: keyof ReturnType<typeof createFinishedProductRow>; label: string }> = [
  { key: "productionDateTime", label: "Дата, время изготовления" },
  { key: "rejectionTime", label: "Время снятия бракеража" },
  { key: "productName", label: "Наименование блюд (изделий)" },
  { key: "organoleptic", label: "Органолептическая оценка" },
  { key: "productTemp", label: "Т °С внутри продукта" },
  { key: "correctiveAction", label: "Корректирующие действия" },
  { key: "releasePermissionTime", label: "Разрешение к реализации" },
  { key: "courierTransferTime", label: "Время передачи блюд курьеру" },
  { key: "responsiblePerson", label: "Ответственный исполнитель" },
  { key: "inspectorName", label: "ФИО лица, проводившего бракераж" },
];

export function FinishedProductDocumentClient({
  documentId,
  title,
  organizationName,
  dateFrom,
  dateTo,
  status,
  initialConfig,
  users,
}: Props) {
  const router = useRouter();
  const [config, setConfig] = useState(() => normalizeFinishedProductDocumentConfig(initialConfig));
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);

  function updateRow(rowId: string, key: keyof ReturnType<typeof createFinishedProductRow>, value: string) {
    setConfig((current) => ({
      rows: current.rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
    }));
  }

  function addRow() {
    setConfig((current) => ({
      rows: [
        ...current.rows,
        createFinishedProductRow({
          responsiblePerson: users[0]?.name || "",
          inspectorName: users[1]?.name || users[0]?.name || "",
        }),
      ],
    }));
  }

  function removeRow(rowId: string) {
    setConfig((current) => ({
      rows: current.rows.length > 1 ? current.rows.filter((row) => row.id !== rowId) : current.rows,
    }));
  }

  async function saveConfig() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/journal-documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });

      if (!response.ok) {
        throw new Error("Не удалось сохранить журнал");
      }

      startTransition(() => router.refresh());
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8 text-black">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-[#7a7f93]">{organizationName}</div>
          <h1 className="text-[34px] font-semibold tracking-[-0.03em]">{title}</h1>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={addRow}>
            <Plus className="size-4" />
            Добавить изделие
          </Button>
          <Button type="button" className="rounded-2xl bg-[#5b66ff] hover:bg-[#4d58f5]" onClick={saveConfig} disabled={isSaving || isPending}>
            <Save className="size-4" />
            {isSaving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-[#e4e6ef] bg-white p-6">
        <table className="mb-6 w-full border-collapse">
          <tbody>
            <tr>
              <td rowSpan={2} className="w-[22%] border border-black px-4 py-4 text-center text-[18px] font-semibold">
                {organizationName}
              </td>
              <td className="border border-black px-4 py-3 text-center text-[16px] uppercase">
                СИСТЕМА ХАССП
              </td>
              <td className="w-[18%] border border-black px-4 py-3 text-center text-[15px]">
                Начат&nbsp;&nbsp;{new Date(dateFrom).toLocaleDateString("ru-RU")}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-4 py-3 text-center text-[15px] uppercase">
                ЖУРНАЛ БРАКЕРАЖА ГОТОВОЙ ПИЩЕВОЙ ПРОДУКЦИИ
              </td>
              <td className="border border-black px-4 py-3 text-center text-[15px]">
                Окончен&nbsp;&nbsp;{status === "closed" ? new Date(dateTo).toLocaleDateString("ru-RU") : "________"}
              </td>
            </tr>
          </tbody>
        </table>

        <h2 className="mb-6 text-center text-[28px] font-semibold uppercase tracking-[-0.02em]">
          Журнал бракеража готовой пищевой продукции
        </h2>

        <table className="min-w-[1700px] w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#f8f8fb]">
              <th className="w-12 border p-2">#</th>
              {COLUMNS.map((column) => (
                <th key={column.key} className="border p-2 text-left font-medium">
                  {column.label}
                </th>
              ))}
              <th className="w-16 border p-2" />
            </tr>
          </thead>
          <tbody>
            {config.rows.map((row, index) => (
              <tr key={row.id}>
                <td className="border p-2 align-top text-center">{index + 1}</td>
                {COLUMNS.map((column) => (
                  <td key={column.key} className="border p-1 align-top">
                    <Input
                      value={row[column.key]}
                      onChange={(event) => updateRow(row.id, column.key, event.target.value)}
                      className="min-w-[140px] border-0 bg-transparent shadow-none"
                    />
                  </td>
                ))}
                <td className="border p-1 align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(row.id)}
                    disabled={config.rows.length === 1}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
