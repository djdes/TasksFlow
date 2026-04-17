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
