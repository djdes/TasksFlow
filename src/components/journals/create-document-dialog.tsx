"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { getUsersForRoleLabel } from "@/lib/user-roles";
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
  CLEANING_PAGE_TITLE,
  defaultCleaningDocumentConfig,
  getCleaningCreatePeriodBounds,
  getCleaningDocumentTitle,
} from "@/lib/cleaning-document";
import {
  FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE,
  getFinishedProductCreatePeriodBounds,
  getFinishedProductDocumentTitle,
} from "@/lib/finished-product-document";
import {
  ACCEPTANCE_DOCUMENT_TEMPLATE_CODE,
  getAcceptanceDocumentDefaultConfig,
} from "@/lib/acceptance-document";
import {
  getRegisterDocumentCreatePeriodBounds,
  getRegisterDocumentTitle,
  isRegisterDocumentTemplate,
} from "@/lib/register-document";
import {
  getHealthDocumentTitle,
  getHygieneCreatePeriodBounds,
  getHygieneDocumentTitle,
  getHygienePositionLabel,
  getStaffJournalResponsibleTitleOptions,
  HYGIENE_PERIODICITY_TEXT,
} from "@/lib/hygiene-document";
import { isStaffDocumentTemplate } from "@/lib/journal-document-helpers";
import {
  PositionEmployeePicker,
  PositionSelectItems,
} from "@/components/shared/position-select";
import {
  getTrackedDocumentCreateMode,
  getTrackedDocumentTitle,
  isSourceStyleTrackedTemplate,
} from "@/lib/tracked-document";
import {
  UV_LAMP_RUNTIME_TEMPLATE_CODE,
  buildUvRuntimeDocumentTitle,
  defaultUvSpecification,
} from "@/lib/uv-lamp-runtime-document";
import {
  MED_BOOK_TEMPLATE_CODE,
  MED_BOOK_DOCUMENT_TITLE,
} from "@/lib/med-book-document";
import {
  PERISHABLE_REJECTION_TEMPLATE_CODE,
  PERISHABLE_REJECTION_DOCUMENT_TITLE,
  getPerishableRejectionCreatePeriodBounds,
} from "@/lib/perishable-rejection-document";
import {
  PRODUCT_WRITEOFF_DOCUMENT_TITLE,
  PRODUCT_WRITEOFF_TEMPLATE_CODE,
  getProductWriteoffCreatePeriodBounds,
} from "@/lib/product-writeoff-document";
import {
  STAFF_TRAINING_TEMPLATE_CODE,
  STAFF_TRAINING_DOCUMENT_TITLE,
  getStaffTrainingCreatePeriodBounds,
} from "@/lib/staff-training-document";
import {
  FRYER_OIL_TEMPLATE_CODE,
  defaultFryerOilDocumentConfig,
} from "@/lib/fryer-oil-document";
import {
  EQUIPMENT_MAINTENANCE_TEMPLATE_CODE,
  EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE,
  getMaintenanceCreatePeriodBounds,
} from "@/lib/equipment-maintenance-document";
import {
  EQUIPMENT_CALIBRATION_TEMPLATE_CODE,
  EQUIPMENT_CALIBRATION_DOCUMENT_TITLE,
  getCalibrationCreatePeriodBounds,
} from "@/lib/equipment-calibration-document";
import {
  SANITARY_DAY_CHECKLIST_TEMPLATE_CODE,
  defaultSdcConfig,
} from "@/lib/sanitary-day-checklist-document";
import {
  EQUIPMENT_CLEANING_TEMPLATE_CODE,
  EQUIPMENT_CLEANING_VARIANT_LABELS,
  getDefaultEquipmentCleaningConfig,
  getEquipmentCleaningCreatePeriodBounds,
  getEquipmentCleaningDocumentTitle,
  type EquipmentCleaningFieldVariant,
} from "@/lib/equipment-cleaning-document";

interface Props {
  templateCode: string;
  templateName: string;
  users: { id: string; name: string; role: string }[];
  triggerClassName?: string;
  triggerLabel?: string;
  triggerIcon?: ReactNode;
}

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
              : templateCode === EQUIPMENT_MAINTENANCE_TEMPLATE_CODE
                ? getMaintenanceCreatePeriodBounds()
              : templateCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE
                ? getCalibrationCreatePeriodBounds()
              : templateCode === STAFF_TRAINING_TEMPLATE_CODE
                ? getStaffTrainingCreatePeriodBounds()
              : templateCode === PERISHABLE_REJECTION_TEMPLATE_CODE
                ? getPerishableRejectionCreatePeriodBounds()
                : templateCode === EQUIPMENT_CLEANING_TEMPLATE_CODE
                  ? getEquipmentCleaningCreatePeriodBounds()
                : templateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE
                  ? getProductWriteoffCreatePeriodBounds()
                : isRegisterDocumentTemplate(templateCode)
                ? getRegisterDocumentCreatePeriodBounds()
                : getHygieneCreatePeriodBounds(),
    [templateCode]
  );

  const isStaffJournal = isStaffDocumentTemplate(templateCode);
  const isCleaningJournal = templateCode === CLEANING_DOCUMENT_TEMPLATE_CODE;
  const isClimateJournal = templateCode === CLIMATE_DOCUMENT_TEMPLATE_CODE;
  const isColdEquipmentJournal = templateCode === COLD_EQUIPMENT_DOCUMENT_TEMPLATE_CODE;
  const isSourceStyleTrackedJournal = isSourceStyleTrackedTemplate(templateCode);
  const isAcceptanceJournal = templateCode === ACCEPTANCE_DOCUMENT_TEMPLATE_CODE;
  const isUvRuntimeJournal = templateCode === UV_LAMP_RUNTIME_TEMPLATE_CODE;
  const isMedBookJournal = templateCode === MED_BOOK_TEMPLATE_CODE;
  const isPerishableRejectionJournal = templateCode === PERISHABLE_REJECTION_TEMPLATE_CODE;
  const isEquipmentCleaningJournal = templateCode === EQUIPMENT_CLEANING_TEMPLATE_CODE;
  const isProductWriteoffJournal = templateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE;
  const isStaffTrainingJournal = templateCode === STAFF_TRAINING_TEMPLATE_CODE;
  const isEquipmentMaintenanceJournal = templateCode === EQUIPMENT_MAINTENANCE_TEMPLATE_CODE;
  const isEquipmentCalibrationJournal = templateCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE;
  const trackedCreateMode = getTrackedDocumentCreateMode(templateCode);
  const usesFixedDocumentTitle = isClimateJournal || isColdEquipmentJournal;
  const showDateFields = !isColdEquipmentJournal;

  const responsibleTitleOptions = useMemo(
    () =>
      isStaffJournal || isSourceStyleTrackedJournal || isCleaningJournal
        ? getStaffJournalResponsibleTitleOptions(users)
        : [],
    [isStaffJournal, isSourceStyleTrackedJournal, isCleaningJournal, users]
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
                : templateCode === EQUIPMENT_MAINTENANCE_TEMPLATE_CODE
                  ? EQUIPMENT_MAINTENANCE_DOCUMENT_TITLE
                : templateCode === EQUIPMENT_CALIBRATION_TEMPLATE_CODE
                  ? EQUIPMENT_CALIBRATION_DOCUMENT_TITLE
                : templateCode === STAFF_TRAINING_TEMPLATE_CODE
                  ? STAFF_TRAINING_DOCUMENT_TITLE
                : templateCode === PERISHABLE_REJECTION_TEMPLATE_CODE
                  ? PERISHABLE_REJECTION_DOCUMENT_TITLE
                : templateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE
                  ? PRODUCT_WRITEOFF_DOCUMENT_TITLE
                : templateCode === EQUIPMENT_CLEANING_TEMPLATE_CODE
                  ? getEquipmentCleaningDocumentTitle()
                : templateCode === MED_BOOK_TEMPLATE_CODE
                  ? MED_BOOK_DOCUMENT_TITLE
                : isSourceStyleTrackedJournal
                  ? getTrackedDocumentTitle(templateCode)
                  : isRegisterDocumentTemplate(templateCode)
                    ? getRegisterDocumentTitle(templateCode)
                    : templateName
  );
  const [dateFrom, setDateFrom] = useState(defaultPeriod.dateFrom);
  const [dateTo, setDateTo] = useState(defaultPeriod.dateTo);
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [responsibleTitle, setResponsibleTitle] = useState(
    isStaffJournal || isSourceStyleTrackedJournal || isCleaningJournal ? responsibleTitleOptions[0] || "" : ""
  );
  const [trackedAreaName, setTrackedAreaName] = useState("");
  const [trackedLampNumber, setTrackedLampNumber] = useState("1");
  const [fpFieldNameMode, setFpFieldNameMode] = useState<"dish" | "semi">("dish");
  const [fpInspectorMode, setFpInspectorMode] = useState<"inspector_name" | "commission_signatures">(
    "inspector_name"
  );
  const [fpShowProductTemp, setFpShowProductTemp] = useState(false);
  const [fpShowCorrectiveAction, setFpShowCorrectiveAction] = useState(false);
  const [fpShowOxygenLevel, setFpShowOxygenLevel] = useState(false);
  const [fpShowCourierTime, setFpShowCourierTime] = useState(false);
  const [fpFooterNote, setFpFooterNote] = useState("");
  const [medBookIncludeVaccinations, setMedBookIncludeVaccinations] = useState(true);
  const [productWriteoffActNumber, setProductWriteoffActNumber] = useState("1");
  const [productWriteoffComment, setProductWriteoffComment] = useState("");
  const [equipmentCleaningVariant, setEquipmentCleaningVariant] =
    useState<EquipmentCleaningFieldVariant>("rinse_temperature");
  const [cleaningVentilation, setCleaningVentilation] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const selectedResponsibleUser =
        (isAcceptanceJournal ? responsibleUserId : "") ||
        responsibleUserId ||
        users.find((user) =>
          isStaffJournal || isSourceStyleTrackedJournal || isCleaningJournal
            ? getHygienePositionLabel(user.role) === responsibleTitle
            : false
        )?.id;

      const res = await fetch("/api/journal-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateCode,
          title: isUvRuntimeJournal
            ? buildUvRuntimeDocumentTitle({
                lampNumber: trackedLampNumber.trim() || "1",
                areaName: trackedAreaName.trim() || "Журнал учета работы",
                spec: defaultUvSpecification(),
              })
            : title.trim(),
          dateFrom,
          dateTo,
          responsibleUserId: selectedResponsibleUser || undefined,
          responsibleTitle: responsibleTitle || undefined,
          config: isCleaningJournal
            ? {
                ...defaultCleaningDocumentConfig(users),
                ventilationEnabled: cleaningVentilation,
              }
            : isEquipmentCleaningJournal
            ? {
                ...getDefaultEquipmentCleaningConfig(),
                fieldVariant: equipmentCleaningVariant,
              }
            : isEquipmentMaintenanceJournal
            ? { year: Number(dateFrom.slice(0, 4)), documentDate: dateFrom }
            : isEquipmentCalibrationJournal
            ? { year: Number(dateFrom.slice(0, 4)), documentDate: dateFrom, rows: [], approveRole: responsibleTitle || "Управляющий", approveEmployee: "" }
            : isStaffTrainingJournal
            ? { showSignatureField: medBookIncludeVaccinations }
            : isMedBookJournal
            ? {
                includeVaccinations: medBookIncludeVaccinations,
              }
            : isAcceptanceJournal
              ? {
                  ...getAcceptanceDocumentDefaultConfig(users),
                  showPackagingComplianceField: fpShowCorrectiveAction,
                  defaultResponsibleTitle: responsibleTitle || null,
                  defaultResponsibleUserId: selectedResponsibleUser || null,
                }
              : templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE
              ? {
                  fieldNameMode: fpFieldNameMode,
                  inspectorMode: fpInspectorMode,
                  showProductTemp: fpShowProductTemp,
                  showCorrectiveAction: fpShowCorrectiveAction,
                  showOxygenLevel: fpShowOxygenLevel,
                  showCourierTime: fpShowCourierTime,
                  footerNote: fpFooterNote.trim(),
                }
            : templateCode === FRYER_OIL_TEMPLATE_CODE
              ? defaultFryerOilDocumentConfig()
              : templateCode === PRODUCT_WRITEOFF_TEMPLATE_CODE
              ? {
                  documentName: title.trim() || PRODUCT_WRITEOFF_DOCUMENT_TITLE,
                  actNumber: productWriteoffActNumber || "1",
                  documentDate: dateFrom,
                  comment: productWriteoffComment,
                }
              : templateCode === SANITARY_DAY_CHECKLIST_TEMPLATE_CODE
              ? defaultSdcConfig()
              : isSourceStyleTrackedJournal && (trackedAreaName.trim() || isUvRuntimeJournal)
                ? isUvRuntimeJournal
                  ? {
                      lampNumber: trackedLampNumber.trim() || "1",
                      areaName: trackedAreaName.trim() || "Журнал учета работы",
                      spec: defaultUvSpecification(),
                    }
                  : { areaName: trackedAreaName.trim() }
                : undefined,
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

  const isCompactSourceModal = isStaffJournal || isSourceStyleTrackedJournal || isMedBookJournal || isPerishableRejectionJournal || isProductWriteoffJournal || isStaffTrainingJournal || isEquipmentMaintenanceJournal || isEquipmentCalibrationJournal || isCleaningJournal || isEquipmentCleaningJournal;
  const showDateTo = !isClimateJournal && !isColdEquipmentJournal;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={cn(triggerClassName)}>
          {triggerIcon || <Plus className="size-4" />}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "w-[calc(100vw-2rem)] max-w-[560px] rounded-[24px] border-0 p-0",
          isCompactSourceModal && "max-w-[620px] rounded-[28px]"
        )}
      >
        <DialogHeader className={cn("border-b px-6 py-5", isCompactSourceModal && "px-8 py-6")}>
          <DialogTitle className={cn("text-[20px] font-medium text-black", isCompactSourceModal && "text-[24px]")}>
            {isCompactSourceModal ? "Создание документа" : `Создать документ: ${templateName}`}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className={cn("space-y-4 px-6 py-5", isCompactSourceModal && "space-y-5 px-8 py-6")}
        >
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {isCompactSourceModal ? (
            <>
              {trackedCreateMode === "uv" ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="uv-lamp-number" className="text-[16px] text-[#6f7282]">
                      Бактерицидная установка №
                    </Label>
                    <Input
                      id="uv-lamp-number"
                      value={trackedLampNumber}
                      onChange={(e) => setTrackedLampNumber(e.target.value)}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="tracked-area-name" className="sr-only">
                      Наименование цеха или участка
                    </Label>
                    <Input
                      id="tracked-area-name"
                      value={trackedAreaName}
                      onChange={(e) => setTrackedAreaName(e.target.value)}
                      placeholder="Введите наименование цеха/участка применения"
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor="doc-title" className="sr-only">
                    Название документа
                  </Label>
                  <Input
                    id="doc-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Введите название документа"
                    className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                    required
                  />
                </div>
              )}

              {isMedBookJournal && (
                <label className="flex items-center gap-3 text-[16px]">
                  <input
                    type="checkbox"
                    checked={medBookIncludeVaccinations}
                    onChange={(e) => setMedBookIncludeVaccinations(e.target.checked)}
                    className="size-5 rounded accent-[#5b66ff]"
                  />
                  включить &quot;Прививки&quot;
                </label>
              )}

              {isEquipmentCleaningJournal && (
                <>
                  <div className="space-y-3">
                    <Label htmlFor="equipment-cleaning-date-from" className="text-[14px] text-[#73738a]">
                      Дата начала
                    </Label>
                    <Input
                      id="equipment-cleaning-date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setDateTo(e.target.value);
                      }}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="text-[18px] font-semibold text-black">Название поля</div>
                    <div className="flex flex-col gap-3 text-[18px] text-black sm:flex-row sm:gap-8">
                      {(Object.keys(EQUIPMENT_CLEANING_VARIANT_LABELS) as EquipmentCleaningFieldVariant[]).map((variant) => (
                        <label key={variant} className="flex items-center gap-3">
                          <input
                            type="radio"
                            checked={equipmentCleaningVariant === variant}
                            onChange={() => setEquipmentCleaningVariant(variant)}
                            className="size-5 accent-[#5b66ff]"
                          />
                          {EQUIPMENT_CLEANING_VARIANT_LABELS[variant]}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {isPerishableRejectionJournal && (
                <div className="space-y-3">
                  <Label htmlFor="perishable-date-from" className="text-[14px] text-[#73738a]">
                    Дата начала
                  </Label>
                  <Input
                    id="perishable-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                    required
                  />
                </div>
              )}

              {isProductWriteoffJournal && (
                <>
                  <div className="space-y-3">
                    <Label htmlFor="product-writeoff-act-number" className="text-[14px] text-[#73738a]">
                      № акта
                    </Label>
                    <Input
                      id="product-writeoff-act-number"
                      value={productWriteoffActNumber}
                      onChange={(e) => setProductWriteoffActNumber(e.target.value)}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="product-writeoff-date" className="text-[14px] text-[#73738a]">
                      Дата документа
                    </Label>
                    <Input
                      id="product-writeoff-date"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="product-writeoff-comment" className="text-[14px] text-[#73738a]">
                      Комментарий
                    </Label>
                    <Textarea
                      id="product-writeoff-comment"
                      value={productWriteoffComment}
                      onChange={(e) => setProductWriteoffComment(e.target.value)}
                      className="min-h-[150px] rounded-2xl border-[#dfe1ec] px-5 py-4 text-[18px]"
                    />
                  </div>
                </>
              )}

              {isStaffTrainingJournal && (
                <>
                  <div className="space-y-3">
                    <Label htmlFor="training-date-from" className="text-[14px] text-[#73738a]">
                      Дата начала
                    </Label>
                    <Input
                      id="training-date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                      required
                    />
                  </div>
                  <label className="flex items-center gap-3 text-[16px]">
                    <input
                      type="checkbox"
                      checked={medBookIncludeVaccinations}
                      onChange={(e) => setMedBookIncludeVaccinations(e.target.checked)}
                      className="size-5 rounded accent-[#5b66ff]"
                    />
                    Добавить поле &quot;Подпись инструктируемого&quot;
                  </label>
                </>
              )}

              {(isEquipmentMaintenanceJournal || isEquipmentCalibrationJournal) && (
                <>
                  <div className="space-y-3">
                    <Label className="text-[14px] text-[#73738a]">Дата документа</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-[14px] text-[#73738a]">Год</Label>
                    <select
                      value={dateFrom.slice(0, 4)}
                      onChange={(e) => setDateFrom(`${e.target.value}-01-01`)}
                      className="h-11 w-full rounded-2xl border border-[#dfe1ec] bg-[#f3f4fb] px-5 text-[18px]"
                    >
                      {Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - 3 + i)).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {isCleaningJournal && (
                <>
                  <div className="space-y-3">
                    <Label htmlFor="cleaning-date-from" className="text-[14px] text-[#73738a]">
                      Дата начала
                    </Label>
                    <Input
                      id="cleaning-date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 text-[16px]">
                      <input
                        type="checkbox"
                        checked={cleaningVentilation}
                        onChange={(e) => setCleaningVentilation(e.target.checked)}
                        className="size-5 rounded accent-[#5b66ff]"
                      />
                      Проветривание
                    </label>
                    <p className="text-[14px] text-[#73738a]">
                      Если у вас есть окна и возможность проветривать помещение
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-[14px] text-[#73738a]">Должность ответственного</Label>
                    <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
                      <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                        <SelectValue placeholder="- Выберите значение -" />
                      </SelectTrigger>
                      <SelectContent>
                        <PositionSelectItems users={users} />
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {!isMedBookJournal && !isPerishableRejectionJournal && !isProductWriteoffJournal && !isStaffTrainingJournal && !isEquipmentMaintenanceJournal && !isEquipmentCalibrationJournal && !isCleaningJournal && !isEquipmentCleaningJournal && (
              <div className="space-y-3">
                <Label className="text-[14px] text-[#73738a]">Должность ответственного</Label>
                <Select value={responsibleTitle} onValueChange={setResponsibleTitle}>
                  <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                    <SelectValue placeholder="- Выберите значение -" />
                  </SelectTrigger>
                  <SelectContent>
                    <PositionSelectItems users={users} />
                  </SelectContent>
                </Select>
              </div>
              )}

              {!isMedBookJournal && !isPerishableRejectionJournal && !isProductWriteoffJournal && !isStaffTrainingJournal && !isEquipmentMaintenanceJournal && !isEquipmentCalibrationJournal && !isCleaningJournal && !isEquipmentCleaningJournal && (isStaffJournal || trackedCreateMode === "staff" ? (
                <div className="space-y-2 rounded-2xl border border-[#dfe1ec] px-5 py-4">
                  <div className="text-[18px] text-[#73738a]">Периодичность контроля</div>
                  <div className="text-[15px] leading-[1.35] text-black">
                    {templateCode === "health_check"
                      ? "Документ создается автоматически на период 15 дней."
                      : HYGIENE_PERIODICITY_TEXT}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label htmlFor="tracked-date-from" className="text-[14px] text-[#73738a]">
                    {trackedCreateMode === "uv" || isAcceptanceJournal
                      ? "Дата начала"
                      : "Дата документа"}
                  </Label>
                  <Input
                    id="tracked-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-11 rounded-2xl border-[#dfe1ec] px-4 text-[15px]"
                    required
                  />
                </div>
              ))}

              {isAcceptanceJournal && (
                <>
                  <div className="space-y-3">
                    <Label className="text-[14px] text-[#73738a]">Добавить поля</Label>
                    <label className="flex items-center gap-3 text-[15px]">
                      <Checkbox
                        checked={fpShowCorrectiveAction}
                        onCheckedChange={(checked) => setFpShowCorrectiveAction(checked === true)}
                      />
                      &quot;Соответствие внешнего вида упаковки, маркировки требованиям НД&quot;
                    </label>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-[14px] text-[#73738a]">Сотрудник</Label>
                    <Select value={responsibleUserId} onValueChange={setResponsibleUserId}>
                      <SelectTrigger className="h-11 rounded-2xl border-[#dfe1ec] bg-[#f3f4fb] px-4 text-[15px]">
                        <SelectValue placeholder="- Выберите значение -" />
                      </SelectTrigger>
                      <SelectContent>
                        {(responsibleTitle
                          ? getUsersForRoleLabel(users, responsibleTitle)
                          : users
                        ).map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="hidden">
                {(isStaffJournal || trackedCreateMode === "staff") && (
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                )}
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 rounded-2xl bg-[#5b66ff] px-6 text-[15px] text-white hover:bg-[#4b57ff]"
                >
                  {isSubmitting ? "Создание..." : "Создать"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {!usesFixedDocumentTitle && (
                <div className="space-y-2">
                  <Label htmlFor="doc-title-main">Название документа</Label>
                  <Input
                    id="doc-title-main"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Введите название документа"
                  />
                </div>
              )}

              {showDateFields ? (
                <div className={cn("grid gap-4", showDateTo ? "grid-cols-2" : "grid-cols-1")}>
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
                  {showDateTo && (
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
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-[#dfe1ec] px-4 py-3 text-sm text-muted-foreground">
                  Период документа автоматически задается на 15 дней.
                </div>
              )}

              {!isCleaningJournal && (
                <PositionEmployeePicker
                  users={users}
                  value={{ positionTitle: responsibleTitle, userId: responsibleUserId }}
                  onChange={(next) => {
                    setResponsibleTitle(next.positionTitle);
                    setResponsibleUserId(next.userId);
                  }}
                  positionLabel="Должность ответственного"
                  employeeLabel="Ответственный"
                />
              )}

              {isCleaningJournal && (
                <div className="rounded-xl border border-[#dfe1ec] px-4 py-3 text-sm text-muted-foreground">
                  Ответственных за уборку и контроль можно настроить внутри документа.
                </div>
              )}

              {templateCode === FINISHED_PRODUCT_DOCUMENT_TEMPLATE_CODE && (
                <>
                  <div className="space-y-2 rounded-xl border border-[#dfe1ec] p-4">
                    <Label>Название поля</Label>
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={fpFieldNameMode === "dish"}
                          onChange={() => setFpFieldNameMode("dish")}
                        />
                        Наименование блюд (изделий)
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={fpFieldNameMode === "semi"}
                          onChange={() => setFpFieldNameMode("semi")}
                        />
                        Наименование полуфабриката
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-[#dfe1ec] p-4">
                    <Label>Добавить поля</Label>
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={fpShowProductTemp}
                          onCheckedChange={(checked) => setFpShowProductTemp(checked === true)}
                        />
                        Т°С внутри продукта и корректирующие действия
                      </label>
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={fpShowCorrectiveAction}
                          onCheckedChange={(checked) => setFpShowCorrectiveAction(checked === true)}
                        />
                        Примечание
                      </label>
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={fpShowOxygenLevel}
                          onCheckedChange={(checked) => setFpShowOxygenLevel(checked === true)}
                        />
                        Остаточный уровень кислорода, % об.
                      </label>
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={fpShowCourierTime}
                          onCheckedChange={(checked) => setFpShowCourierTime(checked === true)}
                        />
                        Время передачи блюд курьеру
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-[#dfe1ec] p-4">
                    <Label>Название поля</Label>
                    <div className="space-y-2 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={fpInspectorMode === "inspector_name"}
                          onChange={() => setFpInspectorMode("inspector_name")}
                        />
                        ФИО лица, проводившего бракераж
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={fpInspectorMode === "commission_signatures"}
                          onChange={() => setFpInspectorMode("commission_signatures")}
                        />
                        Подписи членов бракеражной комиссии
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Input
                      value={fpFooterNote}
                      onChange={(e) => setFpFooterNote(e.target.value)}
                      placeholder="Примечание: (внизу, после таблицы)"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isSubmitting}
                  className="h-10 rounded-xl px-4"
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={isSubmitting} className="h-10 rounded-xl px-4">
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
