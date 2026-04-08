"use client";

import { Fragment } from "react";
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

export function HygieneDocumentClient({}: Props) {
  const dateKeys = buildFixedHygieneExampleDateKeys();
  const entryMap = buildExampleHygieneEntryMap();

  return (
    <div className="bg-white text-black">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 10mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          body {
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .hygiene-sheet {
            width: 100%;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .hygiene-grid {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed;
          }

          .hygiene-grid th,
          .hygiene-grid td {
            font-size: 10px !important;
            line-height: 1.1 !important;
            padding: 4px 3px !important;
          }

          .hygiene-header td {
            font-size: 11px !important;
            line-height: 1.15 !important;
            padding: 8px 10px !important;
          }

          .hygiene-title {
            font-size: 24px !important;
            margin-bottom: 26px !important;
          }

          .hygiene-notes,
          .hygiene-legend,
          .hygiene-reminder {
            font-size: 10px !important;
            line-height: 1.2 !important;
          }
        }
      `}</style>

      <div className="hygiene-sheet mx-auto max-w-[1720px] px-8 py-6">
        <h1 className="hygiene-title mb-10 text-[60px] font-semibold tracking-[-0.04em]">
          Гигиенический журнал
        </h1>

        <div className="mx-auto max-w-[1380px]">
          <table className="hygiene-header mb-10 w-full border-collapse">
            <tbody>
              <tr>
                <td
                  rowSpan={2}
                  className="w-[270px] border border-black px-8 py-8 text-center text-[22px] font-semibold"
                >
                  {HYGIENE_EXAMPLE_ORGANIZATION}
                </td>
                <td className="border border-black px-8 py-4 text-center text-[18px] uppercase">
                  СИСТЕМА ХАССП
                </td>
                <td
                  rowSpan={2}
                  className="w-[170px] border border-black px-8 py-8 text-center text-[18px] uppercase"
                >
                  СТР. 1 ИЗ 1
                </td>
              </tr>
              <tr>
                <td className="border border-black px-8 py-4 text-center text-[17px] italic uppercase">
                  ГИГИЕНИЧЕСКИЙ ЖУРНАЛ
                </td>
              </tr>
              <tr>
                <td className="border border-black px-6 py-5 text-center text-[18px] font-semibold">
                  Периодичность контроля
                </td>
                <td colSpan={2} className="border border-black px-8 py-5 text-[16px] leading-7">
                  <div>{HYGIENE_REGISTER_PERIODICITY[0]}</div>
                  <div>{HYGIENE_REGISTER_PERIODICITY[1]}</div>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mb-6 text-center text-[34px] font-bold uppercase">
            {HYGIENE_EXAMPLE_TITLE}
          </div>

          <table className="hygiene-grid w-full border-collapse text-[15px]">
            <thead>
              <tr className="bg-[#f2f2f2]">
                <th className="w-[72px] border border-black p-2 text-center font-semibold" rowSpan={2}>
                  № п/п
                </th>
                <th className="w-[230px] border border-black p-2 text-center font-semibold" rowSpan={2}>
                  Ф.И.О. работника
                </th>
                <th className="w-[290px] border border-black p-2 text-center font-semibold" rowSpan={2}>
                  Должность
                </th>
                <th className="border border-black p-2 text-center text-[16px] font-semibold" colSpan={15}>
                  Месяц {HYGIENE_EXAMPLE_MONTH}
                </th>
              </tr>
              <tr className="bg-[#f2f2f2]">
                {dateKeys.map((dateKey) => (
                  <th key={dateKey} className="w-[58px] border border-black p-2 text-center font-semibold">
                    {getDayNumber(dateKey)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {HYGIENE_EXAMPLE_EMPLOYEES.map((employee) => (
                <Fragment key={employee.id}>
                  <tr>
                    <td rowSpan={2} className="border border-black p-2 text-center align-middle">
                      {employee.number}
                    </td>
                    <td className="border border-black p-2 text-center">
                      {employee.name || ""}
                    </td>
                    <td className="border border-black p-2 text-center">
                      {employee.position || ""}
                    </td>
                    {dateKeys.map((dateKey) => {
                      const entry = entryMap[makeCellKey(employee.id, dateKey)];
                      const statusMeta = getStatusMeta(entry?.status);

                      return (
                        <td
                          key={`${employee.id}:${dateKey}:status`}
                          className="border border-black p-2 text-center"
                        >
                          {statusMeta?.code || ""}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td colSpan={2} className="border border-black p-2 text-center">
                      Температура сотрудника более 37°C?
                    </td>
                    {dateKeys.map((dateKey) => {
                      const entry = entryMap[makeCellKey(employee.id, dateKey)];

                      let value = "";
                      if (entry?.temperatureAbove37 === false) value = "нет";
                      if (entry?.temperatureAbove37 === true) value = "да";
                      if (
                        entry?.temperatureAbove37 === null &&
                        entry?.status === "day_off"
                      ) {
                        value = "-";
                      }

                      return (
                        <td
                          key={`${employee.id}:${dateKey}:temp`}
                          className="border border-black p-2 text-center"
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              ))}

              <tr>
                <td colSpan={2} className="border border-black p-2 text-center">
                  Должность ответственного за контроль
                </td>
                <td className="border border-black p-2 text-center">Управляющий</td>
                {dateKeys.map((dateKey) => (
                  <td key={`blank:${dateKey}`} className="border border-black p-2" />
                ))}
              </tr>
            </tbody>
          </table>

          <div className="hygiene-notes mt-8 text-[16px] leading-7">
            <div className="font-semibold">В журнал регистрируются результаты:</div>
            {HYGIENE_REGISTER_NOTES.map((note) => (
              <div key={note}>- {note}</div>
            ))}
          </div>

          <div className="hygiene-reminder mt-6 text-[16px] font-semibold leading-7">
            Список работников, отмеченных в журнале на день осмотра, должен соответствовать числу работников на этот день в смену
          </div>

          <div className="hygiene-legend mt-8 text-[16px] leading-7">
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
  );
}
