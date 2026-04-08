"use client";

import { Fragment, useState } from "react";
import { ChevronDown, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HYGIENE_EXAMPLE_EMPLOYEES,
  HYGIENE_EXAMPLE_MONTH,
  HYGIENE_EXAMPLE_ORGANIZATION,
  HYGIENE_EXAMPLE_TITLE,
  HYGIENE_REGISTER_LEGEND,
  HYGIENE_REGISTER_NOTES,
  HYGIENE_REGISTER_PERIODICITY,
  buildExampleHygieneEntryMap,
  buildFixedHygieneExampleDateKeys,
  getDayNumber,
  getStatusMeta,
  normalizeHygieneEntryData,
  type HygieneEntryData,
} from "@/lib/hygiene-document";

type Props = {
  documentId: string;
  title: string;
  organizationName: string;
  dateFrom: string;
  dateTo: string;
  responsibleTitle: string | null;
  responsibleName: string | null;
  status: string;
  employees: { id: string; name: string; role: string }[];
  initialEntries: { employeeId: string; date: string; data: HygieneEntryData }[];
};

function makeCellKey(employeeId: string, dateKey: string) {
  return `${employeeId}:${dateKey}`;
}

export function HygieneDocumentClient(_props: Props) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const dateKeys = buildFixedHygieneExampleDateKeys();
  const exampleEntries = buildExampleHygieneEntryMap();

  for (const entry of _props.initialEntries) {
    exampleEntries[makeCellKey(entry.employeeId, entry.date)] = normalizeHygieneEntryData(
      entry.data
    );
  }

  return (
    <div className="space-y-4">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 8mm;
        }

        @media print {
          html,
          body {
            background: #fff !important;
          }

          body {
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print-hidden {
            display: none !important;
          }

          .hygiene-print-sheet {
            width: 100%;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .hygiene-print-frame {
            border: none !important;
            box-shadow: none !important;
          }

          .hygiene-print-table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed;
          }

          .hygiene-print-table th,
          .hygiene-print-table td {
            font-size: 10px !important;
            line-height: 1.15 !important;
            padding: 4px 3px !important;
          }

          .hygiene-print-header td {
            font-size: 11px !important;
          }

          .hygiene-print-notes,
          .hygiene-print-legend {
            font-size: 10px !important;
            line-height: 1.2 !important;
          }
        }
      `}</style>

      <div className="print-hidden flex items-center gap-3">
        <Button
          type="button"
          className="h-14 rounded-xl bg-indigo-500 px-6 text-base font-medium text-white hover:bg-indigo-600"
          onClick={() => setIsAddDialogOpen(true)}
        >
          <Plus className="mr-2 size-5" />
          Добавить
          <ChevronDown className="ml-3 size-5" />
        </Button>
        <Button type="button" variant="outline" className="h-14 px-5" onClick={() => window.print()}>
          <Printer className="mr-2 size-4" />
          Печать
        </Button>
      </div>

      <div className="hygiene-print-sheet mx-auto max-w-[1360px]">
        <div className="hygiene-print-frame bg-white">
          <table className="hygiene-print-header mb-6 w-full border-collapse text-black">
            <tbody>
              <tr>
                <td
                  rowSpan={2}
                  className="w-[230px] border border-black px-5 py-6 text-center text-[18px] font-semibold"
                >
                  {HYGIENE_EXAMPLE_ORGANIZATION}
                </td>
                <td className="border border-black px-5 py-3 text-center text-[18px] uppercase">
                  СИСТЕМА ХАССП
                </td>
                <td
                  rowSpan={2}
                  className="w-[145px] border border-black px-5 py-6 text-center text-[16px] uppercase"
                >
                  СТР. 1 ИЗ 1
                </td>
              </tr>
              <tr>
                <td className="border border-black px-5 py-3 text-center text-[17px] italic uppercase">
                  ГИГИЕНИЧЕСКИЙ ЖУРНАЛ
                </td>
              </tr>
              <tr>
                <td className="border border-black px-4 py-4 text-center text-[16px] font-semibold">
                  Периодичность контроля
                </td>
                <td colSpan={2} className="border border-black px-5 py-4 text-[14px] leading-6">
                  <div>{HYGIENE_REGISTER_PERIODICITY[0]}</div>
                  <div>{HYGIENE_REGISTER_PERIODICITY[1]}</div>
                </td>
              </tr>
            </tbody>
          </table>

          <h1 className="mb-6 text-center text-[23px] font-bold uppercase tracking-tight text-black">
            {HYGIENE_EXAMPLE_TITLE}
          </h1>

          <table className="hygiene-print-table w-full border-collapse text-[14px] text-black">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[28px] border border-black p-2 text-center" rowSpan={2}>
                  <Checkbox checked={false} disabled className="mx-auto size-4 rounded-[2px] border-black data-[state=checked]:bg-white" />
                </th>
                <th className="w-[58px] border border-black p-2 text-center font-semibold" rowSpan={2}>
                  № п/п
                </th>
                <th className="w-[190px] border border-black p-2 text-center font-semibold" rowSpan={2}>
                  Ф.И.О. работника
                </th>
                <th className="w-[225px] border border-black p-2 text-center font-semibold" rowSpan={2}>
                  Должность
                </th>
                <th className="border border-black p-2 text-center font-semibold" colSpan={15}>
                  Месяц {HYGIENE_EXAMPLE_MONTH}
                </th>
              </tr>
              <tr className="bg-[#f2f2f2]">
                {dateKeys.map((dateKey) => (
                  <th key={dateKey} className="w-[50px] border border-black p-1 text-center font-medium">
                    {getDayNumber(dateKey)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {HYGIENE_EXAMPLE_EMPLOYEES.map((employee) => (
                <Fragment key={employee.id}>
                  <tr>
                    <td rowSpan={2} className="border border-black p-2 text-center">
                      <Checkbox checked={false} disabled className="mx-auto size-4 rounded-[2px] border-black data-[state=checked]:bg-white" />
                    </td>
                    <td rowSpan={2} className="border border-black p-2 text-center align-middle">
                      {employee.number}
                    </td>
                    <td className="border border-black p-2 text-center">{employee.name}</td>
                    <td className="border border-black p-2 text-center">{employee.position}</td>
                    {dateKeys.map((dateKey) => {
                      const entry = exampleEntries[makeCellKey(employee.id, dateKey)];
                      const status = getStatusMeta(entry?.status);

                      return (
                        <td key={`${employee.id}:${dateKey}:status`} className="border border-black p-1 text-center">
                          {status?.code || ""}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td colSpan={2} className="border border-black p-2 text-center">
                      Температура сотрудника более 37°C?
                    </td>
                    {dateKeys.map((dateKey) => {
                      const entry = exampleEntries[makeCellKey(employee.id, dateKey)];
                      let value = "";

                      if (entry?.temperatureAbove37 === true) value = "да";
                      if (entry?.temperatureAbove37 === false) value = "нет";
                      if (entry?.temperatureAbove37 === null && entry?.status === "day_off") value = "-";

                      return (
                        <td key={`${employee.id}:${dateKey}:temp`} className="border border-black p-1 text-center">
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              ))}

              <tr>
                <td className="border border-black p-2 text-center">
                  <Checkbox checked={false} disabled className="mx-auto size-4 rounded-[2px] border-black data-[state=checked]:bg-white" />
                </td>
                <td colSpan={2} className="border border-black p-2 text-center">
                  Должность ответственного за контроль
                </td>
                <td className="border border-black p-2 text-center">Управляющий</td>
                {dateKeys.map((dateKey) => (
                  <td key={`footer:${dateKey}`} className="border border-black p-2" />
                ))}
              </tr>
            </tbody>
          </table>

          <div className="mt-6 text-black">
            <div className="hygiene-print-notes text-[14px] leading-6">
              <div className="font-semibold">В журнал регистрируются результаты:</div>
              {HYGIENE_REGISTER_NOTES.map((note) => (
                <div key={note}>- {note}</div>
              ))}
            </div>

            <div className="mt-4 text-[14px] font-semibold">
              Список работников, отмеченных в журнале на день осмотра, должен соответствовать числу работников на этот день в смену
            </div>

            <div className="hygiene-print-legend mt-6 text-[14px] leading-6">
              <div className="font-semibold italic underline">Условные обозначения:</div>
              {HYGIENE_REGISTER_LEGEND.map((item) => (
                <div key={item} className="italic">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Демонстрационный журнал</DialogTitle>
            <DialogDescription>
              Этот экран сейчас зафиксирован под точный образец: 15 дней, тестовые строки и печатная форма как в примере.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setIsAddDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
