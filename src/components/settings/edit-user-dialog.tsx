"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { normalizeUserRole, USER_ROLE_OPTIONS } from "@/lib/user-roles";

const roles = USER_ROLE_OPTIONS;

interface EditUserDialogProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    positionTitle?: string | null;
    phone: string | null;
    isActive: boolean;
  };
  isSelf: boolean;
}

export function EditUserDialog({ user, isSelf }: EditUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(normalizeUserRole(user.role));
  const [phone, setPhone] = useState(user.phone ?? "");
  const [positionTitle, setPositionTitle] = useState(user.positionTitle ?? "");
  const [isActive, setIsActive] = useState(user.isActive);

  function resetForm() {
    setName(user.name);
    setRole(normalizeUserRole(user.role));
    setPhone(user.phone ?? "");
    setPositionTitle(user.positionTitle ?? "");
    setIsActive(user.isActive);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          positionTitle: positionTitle.trim() || null,
          phone: phone || null,
          isActive,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Ошибка");
      }

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
        <Button variant="ghost" size="sm">
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать сотрудника</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="edit-user-name">
              Имя <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user.email} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-user-role">
              Должность <span className="text-destructive">*</span>
            </Label>
            <Select value={role} onValueChange={setRole} disabled={isSelf}>
              <SelectTrigger id="edit-user-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSelf && (
              <p className="text-xs text-muted-foreground">
                Нельзя изменить свою должность
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-user-position">Название должности</Label>
            <Input
              id="edit-user-position"
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="Например: Повар холодного цеха"
            />
            <p className="text-xs text-muted-foreground">
              Отображается в журналах вместо обобщённой роли. Оставьте пустым,
              чтобы использовать стандартную подпись роли.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-user-phone">Телефон</Label>
            <Input
              id="edit-user-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 (999) 123-45-67"
            />
          </div>
          {!isSelf && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Активен</Label>
                <p className="text-xs text-muted-foreground">
                  Деактивированный сотрудник не сможет войти
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
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
              {isSubmitting ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
