"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  Save,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AclRow = {
  templateCode: string;
  canRead: boolean;
  canWrite: boolean;
  canFinalize: boolean;
};

type UserRow = {
  id: string;
  name: string;
  role: string;
  positionName: string | null;
  positionCategory: string | null;
  journalAccessMigrated: boolean;
  initialAccess: AclRow[];
};

type CatalogItem = { code: string; name: string };

type Props = {
  users: UserRow[];
  catalog: CatalogItem[];
};

type Matrix = Map<string, Map<string, boolean>>; // userId -> templateCode -> granted

/**
 * Для быстрого назначения пакетов прав: нажал «Уборка → уборщикам» —
 * всем сотрудникам с должностью, совпадающей по keyword, назначились
 * все указанные журналы в одном клике. Список подобран по наиболее
 * частым реальным связкам кухни/общепита. Matching по `positionName`
 * подстрокой (lower-case).
 */
const PRESETS: Array<{
  label: string;
  icon?: string;
  positionKeywords: string[];
  templateCodes: string[];
}> = [
  {
    label: "Уборка → уборщикам",
    positionKeywords: ["уборщ", "клинер"],
    templateCodes: [
      "cleaning",
      "general_cleaning",
      "cleaning_ventilation_checklist",
      "sanitary_day_checklist",
      "sanitation_day",
      "uv_lamp_runtime",
      "disinfectant_usage",
    ],
  },
  {
    label: "Температура → поварам",
    positionKeywords: ["повар", "шеф", "кух"],
    templateCodes: [
      "climate_control",
      "cold_equipment_control",
      "intensive_cooling",
      "fryer_oil",
      "finished_product",
    ],
  },
  {
    label: "Здоровье → всем",
    positionKeywords: [],
    templateCodes: ["hygiene", "health_check", "med_books"],
  },
  {
    label: "Приёмка → товароведам",
    positionKeywords: ["товаровед", "кладов", "снабж"],
    templateCodes: [
      "incoming_control",
      "incoming_raw_materials_control",
      "perishable_rejection",
      "metal_impurity",
      "traceability_test",
    ],
  },
];

function toMatrix(users: UserRow[]): Matrix {
  const m: Matrix = new Map();
  for (const u of users) {
    const row = new Map<string, boolean>();
    for (const acl of u.initialAccess) {
      if (acl.canRead) row.set(acl.templateCode, true);
    }
    m.set(u.id, row);
  }
  return m;
}

function matrixDiff(base: Matrix, curr: Matrix): Set<string> {
  const changed = new Set<string>();
  for (const [userId, currRow] of curr.entries()) {
    const baseRow = base.get(userId) ?? new Map();
    if (currRow.size !== baseRow.size) {
      changed.add(userId);
      continue;
    }
    for (const [code, value] of currRow.entries()) {
      if (baseRow.get(code) !== value) {
        changed.add(userId);
        break;
      }
    }
  }
  return changed;
}

export function JournalAccessMatrix({ users, catalog }: Props) {
  const router = useRouter();
  const [base] = useState<Matrix>(() => toMatrix(users));
  const [curr, setCurr] = useState<Matrix>(() => toMatrix(users));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [posFilter, setPosFilter] = useState<"all" | "staff" | "management">(
    "all"
  );

  const q = query.trim().toLowerCase();
  const filteredCatalog = useMemo(
    () =>
      catalog.filter(
        (j) =>
          !q ||
          j.name.toLowerCase().includes(q) ||
          j.code.toLowerCase().includes(q)
      ),
    [catalog, q]
  );

  const filteredUsers = useMemo(
    () =>
      users.filter((u) => {
        if (posFilter === "staff" && u.positionCategory !== "staff") return false;
        if (posFilter === "management" && u.positionCategory !== "management")
          return false;
        return true;
      }),
    [users, posFilter]
  );

  const dirty = matrixDiff(base, curr);

  function toggleCell(userId: string, code: string) {
    setCurr((prev) => {
      const copy = new Map(prev);
      const row = new Map(copy.get(userId) ?? new Map());
      if (row.get(code)) {
        row.delete(code);
      } else {
        row.set(code, true);
      }
      copy.set(userId, row);
      return copy;
    });
  }

  function setRowAll(userId: string, value: boolean) {
    setCurr((prev) => {
      const copy = new Map(prev);
      const row = new Map<string, boolean>();
      if (value) {
        for (const j of catalog) row.set(j.code, true);
      }
      copy.set(userId, row);
      return copy;
    });
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setCurr((prev) => {
      const copy = new Map(prev);
      for (const u of users) {
        if (preset.positionKeywords.length > 0) {
          const pos = (u.positionName || "").toLowerCase();
          const matched = preset.positionKeywords.some((kw) =>
            pos.includes(kw)
          );
          if (!matched) continue;
        }
        const row = new Map(copy.get(u.id) ?? new Map<string, boolean>());
        for (const code of preset.templateCodes) row.set(code, true);
        copy.set(u.id, row);
      }
      return copy;
    });
    toast.success(`Применён пресет: ${preset.label}`);
  }

  async function save() {
    if (saving || dirty.size === 0) return;
    setSaving(true);
    try {
      let ok = 0;
      let failed = 0;
      for (const userId of dirty) {
        const row = curr.get(userId) ?? new Map<string, boolean>();
        const access = [...row.keys()].map((code) => ({
          templateCode: code,
          canRead: true,
          canWrite: true,
          canFinalize: false,
        }));
        const res = await fetch(`/api/users/${userId}/access`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access }),
        });
        if (res.ok) ok += 1;
        else failed += 1;
      }
      if (failed > 0) {
        toast.error(`Сохранено ${ok}, ошибок ${failed}`);
      } else {
        toast.success(
          `Сохранено для ${ok} ${pluralPeople(ok)}`
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Presets */}
      <section className="rounded-3xl border border-[#ececf4] bg-[#fafbff] p-5">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#6f7282]">
          <Sparkles className="size-3.5 text-[#5566f6]" />
          Пресеты
        </div>
        <p className="mt-1 text-[12px] text-[#6f7282]">
          Быстро назначить типовые пакеты — по подходящим должностям.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dcdfed] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3c4053] hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-3 rounded-3xl border border-[#ececf4] bg-white p-4 shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
        <div className="relative w-full flex-1 sm:w-auto sm:min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9b9fb3]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Фильтр журналов"
            className="h-10 rounded-2xl border-[#dcdfed] pl-9"
          />
        </div>
        <div className="flex gap-2">
          {([
            ["all", "Все"],
            ["management", "Руководство"],
            ["staff", "Сотрудники"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPosFilter(k)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                posFilter === k
                  ? "border-[#5566f6] bg-[#5566f6] text-white"
                  : "border-[#dcdfed] bg-white text-[#3c4053] hover:bg-[#f5f6ff]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Matrix */}
      <section className="rounded-3xl border border-[#ececf4] bg-white shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
        <div className="flex items-center gap-2 border-b border-[#ececf4] p-4">
          <Users className="size-4 text-[#5566f6]" />
          <h2 className="text-[15px] font-semibold text-[#0b1024]">
            {filteredUsers.length} {pluralPeople(filteredUsers.length)} ·{" "}
            {filteredCatalog.length} журнал{journalSuffix(filteredCatalog.length)}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#ececf4]">
                <th className="sticky left-0 z-[1] bg-white px-3 py-2 text-left font-medium text-[#6f7282]">
                  Сотрудник
                </th>
                <th className="px-2 py-2 text-center font-medium text-[#6f7282]">
                  <span className="text-[11px]">Все / Снять</span>
                </th>
                {filteredCatalog.map((j) => (
                  <th
                    key={j.code}
                    className="px-1 py-2 text-center font-medium text-[#6f7282]"
                  >
                    <div
                      className="mx-auto max-w-[80px] truncate text-[11px] leading-tight"
                      title={j.name}
                    >
                      {j.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => {
                const row = curr.get(u.id) ?? new Map<string, boolean>();
                const rowAllOn = filteredCatalog.every((j) => row.get(j.code));
                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-b border-[#ececf4] last:border-b-0",
                      dirty.has(u.id) && "bg-[#fff8eb]"
                    )}
                  >
                    <td className="sticky left-0 z-[1] min-w-[180px] bg-inherit px-3 py-2">
                      <div className="font-medium text-[#0b1024]">{u.name}</div>
                      <div className="text-[11px] text-[#6f7282]">
                        {u.positionName ?? u.role}
                      </div>
                      {!u.journalAccessMigrated ? (
                        <div className="mt-0.5 text-[10px] text-[#b25f00]">
                          (пока доступ ко всем — до первой правки)
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setRowAll(u.id, !rowAllOn)}
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          rowAllOn
                            ? "border-[#5566f6] bg-[#5566f6] text-white"
                            : "border-[#dcdfed] bg-white text-[#3c4053] hover:bg-[#f5f6ff]"
                        )}
                      >
                        {rowAllOn ? "Снять" : "Все"}
                      </button>
                    </td>
                    {filteredCatalog.map((j) => {
                      const granted = !!row.get(j.code);
                      return (
                        <td key={j.code} className="px-1 py-1 text-center">
                          <button
                            type="button"
                            onClick={() => toggleCell(u.id, j.code)}
                            title={j.name}
                            className={cn(
                              "inline-flex size-7 items-center justify-center rounded-md border transition-colors",
                              granted
                                ? "border-[#7cf5c0] bg-[#ecfdf5] text-[#136b2a]"
                                : "border-[#dcdfed] bg-white text-[#c7ccea] hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
                            )}
                          >
                            {granted ? <Check className="size-3.5" /> : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={filteredCatalog.length + 2}
                    className="px-4 py-10 text-center text-[13px] text-[#9b9fb3]"
                  >
                    Нет сотрудников под фильтр
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Save bar */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-3xl border border-[#ececf4] bg-white/95 px-5 py-3 shadow-[0_12px_32px_-16px_rgba(11,16,36,0.18)] backdrop-blur">
        <div className="text-[13px] text-[#3c4053]">
          {dirty.size === 0
            ? "Изменений нет"
            : `Изменено у ${dirty.size} ${pluralPeople(dirty.size)}`}
        </div>
        <Button
          type="button"
          onClick={save}
          disabled={saving || dirty.size === 0}
          className="ml-auto h-11 rounded-2xl bg-[#5566f6] px-5 text-[14px] font-medium text-white hover:bg-[#4a5bf0] disabled:bg-[#c8cbe0]"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Сохранить
        </Button>
      </div>
    </div>
  );
}

function pluralPeople(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "сотрудника";
  if ([2, 3, 4].includes(m10) && ![12, 13, 14].includes(m100))
    return "сотрудников";
  return "сотрудников";
}
function journalSuffix(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "";
  if ([2, 3, 4].includes(m10) && ![12, 13, 14].includes(m100)) return "а";
  return "ов";
}
