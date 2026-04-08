"use client";

import { type ReactNode, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";
import {
  COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE,
  getColdEquipmentCreatePeriodBounds,
  getColdEquipmentDocumentTitle,
} from "@/lib/cold-equipment-document";
import {
  CLIMATE_DOCUMENT_TEMPLATE_CODE,
  getClimateCreatePeriodBounds,
  getClimateDocumentTitle,
} from "@/lib/climate-document";
import {
  CLEANING_DOCUMENT_TEMPLATE_CODE,
  getCleaningCreatePeriodBounds,
  getCleaningDocumentTitle,
} from "@/lib/cleaning-document";
import {
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  getFinishedProductCreatePeriodBounds,
  getFinishedProductDocumentTitle,
} from "@/lib/finished-product-document";
import {
  getHealthDocumentTitle,
  getHygieneCreatePeriodBounds,
  getHygieneDocumentTitle,
  getHygienePositionLabel,
  getStaffJournalResponsibleTitleOptions,
  HYGIENE_PERIODICITY_TEXT,
} from "@/lib/hygiene-document";
import { isStaffDocumentTemplate } from "@/lib/journal-document-helpers";

interface Props {
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  triggerClassName?: string;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  technologist: "Технолог",
  operator: "Оператор",
};

export function CreateDocumentDialog({
  templateCode,
  templateName,
  users,
  triggerClassName,
  triggerLabel = "Создать документ",
  triggerIcon,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const defaultPeriod = useMemo(
    () =>
      templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
        ? getColdEquipmentCreatePeriodBounds()
        : templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE
        ? getClimateCreatePeriodBounds()
        : templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
        ? getCleaningCreatePeriodBounds()
        : templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE
        ? getFinishedProductCreatePeriodBounds()
        : getHygieneCreatePeriodBounds(),
    [templateCode]
  );
  const isStaffJournal = isStaffDocumentTemplate(templateCode);
  const isCleaningJournal = templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE;
  const responsibleTitleOptions = useMemo(
    () => (isStaffJournal ? getStaffJournalResponsibleTitleOptions(users) : []),
    [isStaffJournal, users]
  );

  const [title, setTitle] = useState(
    templateCode === "hygiene"
      ? getHygieneDocumentTitle()
      : templateCode === "health_check"
        ? getHealthDocumentTitle()
        : templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE
        ? getColdEquipmentDocumentTitle()
        : templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE
        ? getClimateDocumentTitle()
        : templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE
        ? getCleaningDocumentTitle()
        : templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE
        ? getFinishedProductDocumentTitle()
        : templateName
  );
  const [dateFrom, setDateFrom] = useState(defaultPeriod.dateFrom);
  const [dateTo, setDateTo] = useState(defaultPeriod.dateTo);
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [responsibleTitle, setResponsibleTitle] = useState(
    isStaffJournal ? responsibleTitleOptions[0] || "" : ""
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const selectedResponsibleUser =
        responsibleUserId ||
        users.find((user) =>
          isStaffJournal ? getHygienePositionLabel(user.role) === responsibleTitle : false
        )?.id;

      const res = await fetch("/api/journal-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateCode,
          title: title.trim(),
          dateFrom,
          dateTo,
          responsibleUserId: selectedResponsibleUser || undefined,
          responsibleTitle: isCleaningJournal ? undefined : responsibleTitle || undefined,
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

  const isHygiene = isStaffJournal;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={cn(triggerClassName)}>
          {triggerIcon || <Plus className="size-4" />}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className={cn(isHygiene && "max-w-[765px] rounded-[32px] border-0 p-0")}>
        <DialogHeader className={cn(isHygiene && "border-b px-14 py-12")}>
          <DialogTitle className={cn(isHygiene && "text-[32px] font-medium text-black")}>
            {isHygiene ? "Создание документа" : `Создать документ: ${templateName}`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className={cn("space-y-4", isHygiene && "px-14 py-12")}>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {isHygiene ? (
            <>
              <div className="space-y-3">
                <Label htmlFor="doc-title" className="sr-only">
                  Название документа
                </Label>
                <Input
                  id="doc-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Введите название документа"
                  className="h-22 rounded-3xl border-[#dfe1ec] px-8 text-[24px]"
                  required
                />
              </div>

              <div className="space-y-3">
                <Label className="text-[18px] text-[#73738a]">Должность ответственного</Label>
                <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
                  <SelectTrigger className="h-22 rounded-3xl border-[#dfe1ec] bg-[#f3f4fb] px-8 text-[24px]">
                    <SelectValue placeholder="- Выберите значение -" />
                  </SelectTrigger>
                  <SelectContent>
                    {responsibleTitleOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 rounded-3xl border border-[#dfe1ec] px-8 py-6">
                <div className="text-[18px] text-[#73738a]">Периодичность контроля</div>
                <div className="text-[22px] leading-[1.35] text-black">
                  {HYGIENE_PERIODICITY_TEXT}
                </div>
              </div>

              <div className="hidden">
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>

              <div className="flex justify-end pt-6">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-20 rounded-3xl bg-[#5b66ff] px-10 text-[24px] text-white hover:bg-[#4b57ff]"
                >
                  {isSubmitting ? "Создание..." : "Создать"}
                </Button>
              </div>
            </>
          ) : (
            <>
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

              {!isCleaningJournal && (
                <div className="space-y-2">
                  <Label>Ответственный</Label>
                  <Select
                    value={responsibleUserId}
                    onValueChange={(value) => {
                      setResponsibleUserId(value);
                      const user = users.find((item) => item.id === value);
                      if (user) {
                        setResponsibleTitle(ROLE_LABELS[user.role] || user.role);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите ответственного..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({ROLE_LABELS[user.role] || user.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!isCleaningJournal && (
                <div className="space-y-2">
                  <Label htmlFor="doc-title-fallback">Должность ответственного</Label>
                  <Input
                    id="doc-title-fallback"
                    value={responsibleTitle}
                    onChange={(e) => setResponsibleTitle(e.target.value)}
                    placeholder="Например: Управляющий"
                  />
                </div>
              )}

              {isCleaningJournal && (
                <div className="rounded-xl border border-[#dfe1ec] px-4 py-3 text-sm text-muted-foreground">
                  Ответственных за уборку и контроль можно настроить внутри документа.
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
                  {isSubmitting ? "Создание..." : "Создать"}
                </Button>
              </div>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
