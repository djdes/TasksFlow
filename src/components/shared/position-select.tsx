"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getPositionLabelsGrouped, type UserLike } from "@/lib/user-roles";

type PositionSelectProps = {
  /// Whole users collection available for this journal / screen. The
  /// component reads `jobPosition` + `positionTitle` + `role` from each and
  /// groups the distinct labels into management / staff sections.
  users: UserLike[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  triggerClassName?: string;
};

/**
 * Uniform dropdown that every journal should use for a "должность" picker.
 * Labels come from the live DB positions (seeded from admin's
 * /settings/users) and are split into bold-labelled Руководство / Сотрудники
 * groups so the two-column hierarchy from the staff screen is mirrored in
 * every journal that lets the owner pick a role.
 */
export function PositionSelect({
  users,
  value,
  onValueChange,
  placeholder = "- Выберите значение -",
  disabled,
  triggerClassName,
}: PositionSelectProps) {
  const groups = useMemo(() => getPositionLabelsGrouped(users), [users]);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <PositionSelectItems users={users} />
      </SelectContent>
    </Select>
  );
}

/**
 * Just the grouped <SelectItem>s — drop inside an existing <SelectContent>
 * when the enclosing <Select> is already wired up with custom styling /
 * state. Use this in journal clients where the dropdown is embedded in a
 * larger form layout and we don't want to replace the outer <Select>.
 */
export function PositionSelectItems({
  users,
  labelClassName,
}: {
  users: UserLike[];
  labelClassName?: string;
}) {
  const groups = useMemo(() => getPositionLabelsGrouped(users), [users]);
  const labelCls = cn(
    "text-[13px] font-semibold italic text-[#0b1024]",
    labelClassName
  );
  return (
    <>
      {groups.management.length > 0 ? (
        <SelectGroup>
          <SelectLabel className={labelCls}>Руководство</SelectLabel>
          {groups.management.map((label) => (
            <SelectItem key={`m:${label}`} value={label}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      ) : null}
      {groups.staff.length > 0 ? (
        <SelectGroup>
          <SelectLabel className={labelCls}>Сотрудники</SelectLabel>
          {groups.staff.map((label) => (
            <SelectItem key={`s:${label}`} value={label}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      ) : null}
    </>
  );
}

/**
 * Two stacked selects — Должность → Сотрудник — for journals that need to
 * pick a specific employee and don't just care about the position label.
 * Mirrors the pattern used in intensive-cooling-document-client: pick a
 * position (grouped Руководство/Сотрудники), then pick an employee that
 * belongs to that position. Users that don't match the chosen position are
 * hidden from the second select; clearing the position shows all users.
 *
 * Use this wherever a single combined "Должность — ФИО" dropdown starts
 * becoming unwieldy (hygiene staff list, periodic journal entries, etc.).
 */
export function PositionEmployeePicker<T extends UserLike & { id: string }>({
  users,
  value,
  onChange,
  disabled,
  positionLabel = "Должность",
  employeeLabel = "Сотрудник",
  emptyPositionPlaceholder = "- Выберите значение -",
  emptyEmployeePlaceholder = "- Выберите значение -",
  triggerClassName,
  labelClassName,
}: {
  users: T[];
  value: { positionTitle: string; userId: string };
  onChange: (next: { positionTitle: string; userId: string }) => void;
  disabled?: boolean;
  positionLabel?: string;
  employeeLabel?: string;
  emptyPositionPlaceholder?: string;
  emptyEmployeePlaceholder?: string;
  triggerClassName?: string;
  labelClassName?: string;
}) {
  const availableEmployees = useMemo(() => {
    if (!value.positionTitle) return users;
    return users.filter((u) => {
      const label =
        u.jobPosition?.name?.trim() ||
        (typeof u.positionTitle === "string" ? u.positionTitle.trim() : "") ||
        "";
      return label === value.positionTitle;
    });
  }, [users, value.positionTitle]);

  const positionValue = value.positionTitle || "__empty__";
  const userValue = value.userId || "__empty__";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className={cn("text-[13px] font-medium text-[#6f7282]", labelClassName)}>
          {positionLabel}
        </div>
        <Select
          value={positionValue}
          onValueChange={(v) => {
            const nextTitle = v === "__empty__" ? "" : v;
            const stillValid =
              !value.userId ||
              (nextTitle
                ? users.some(
                    (u) =>
                      u.id === value.userId &&
                      (u.jobPosition?.name ?? u.positionTitle ?? "") === nextTitle
                  )
                : true);
            onChange({
              positionTitle: nextTitle,
              userId: stillValid ? value.userId : "",
            });
          }}
          disabled={disabled}
        >
          <SelectTrigger className={triggerClassName}>
            <SelectValue placeholder={emptyPositionPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">{emptyPositionPlaceholder}</SelectItem>
            <PositionSelectItems users={users} />
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className={cn("text-[13px] font-medium text-[#6f7282]", labelClassName)}>
          {employeeLabel}
        </div>
        <Select
          value={userValue}
          onValueChange={(v) => {
            onChange({
              positionTitle: value.positionTitle,
              userId: v === "__empty__" ? "" : v,
            });
          }}
          disabled={disabled}
        >
          <SelectTrigger className={triggerClassName}>
            <SelectValue placeholder={emptyEmployeePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">{emptyEmployeePlaceholder}</SelectItem>
            {availableEmployees.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * Native `<optgroup>` + `<option>` variant for journals that still use a
 * plain HTML `<select>` (glass-list, perishable-rejection, product-writeoff
 * and friends). Drop-in for `{ROLE_OPTIONS.map(...)}` inside `<select>`.
 */
export function PositionNativeOptions({ users }: { users: UserLike[] }) {
  const groups = useMemo(() => getPositionLabelsGrouped(users), [users]);
  return (
    <>
      {groups.management.length > 0 ? (
        <optgroup label="Руководство">
          {groups.management.map((label) => (
            <option key={`m:${label}`} value={label}>
              {label}
            </option>
          ))}
        </optgroup>
      ) : null}
      {groups.staff.length > 0 ? (
        <optgroup label="Сотрудники">
          {groups.staff.map((label) => (
            <option key={`s:${label}`} value={label}>
              {label}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}
