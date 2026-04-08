"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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

interface Props {
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  technologist: "Технолог",
  operator: "Оператор",
};

export function CreateDocumentDialog({ templateCode, templateName, users }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Default period: full month for hygiene journal, otherwise half-month
  const now = new Date();
  const day = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth();

  let defaultFrom: string;
  let defaultTo: string;

  if (templateCode === "hygiene") {
    const lastDay = new Date(year, month + 1, 0).getDate();
    defaultFrom = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    defaultTo = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  } else if (day <= 15) {
    defaultFrom = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    defaultTo = `${year}-${String(month + 1).padStart(2, "0")}-15`;
  } else {
    const lastDay = new Date(year, month + 1, 0).getDate();
    defaultFrom = `${year}-${String(month + 1).padStart(2, "0")}-16`;
    defaultTo = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;
  }

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [responsibleTitle, setResponsibleTitle] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/journal-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateCode,
          dateFrom,
          dateTo,
          responsibleUserId: responsibleUserId || undefined,
          responsibleTitle: responsibleTitle || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка создания");
      }

      const { document: doc } = await res.json();
      setOpen(false);
      router.push(`/journals/${templateCode}/documents/${doc.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Создать документ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Создать документ: {templateName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="doc-from">Дата начала</Label>
              <Input
                id="doc-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-to">Дата окончания</Label>
              <Input
                id="doc-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ответственный</Label>
            <Select value={responsibleUserId} onValueChange={(v) => {
              setResponsibleUserId(v);
              const user = users.find((u) => u.id === v);
              if (user) setResponsibleTitle(ROLE_LABELS[user.role] || user.role);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите ответственного..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({ROLE_LABELS[u.role] || u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-title">Должность ответственного</Label>
            <Input
              id="doc-title"
              value={responsibleTitle}
              onChange={(e) => setResponsibleTitle(e.target.value)}
              placeholder="Например: Управляющий"
            />
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
              {isSubmitting ? "Создание..." : "Создать"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
