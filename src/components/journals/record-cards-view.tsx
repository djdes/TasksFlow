"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * Generic «Карточки» mode for list-style journals (one record per row,
 * many columns). Renders each row as a collapsible card: the first N
 * fields are the header (shown collapsed), the rest appear on expand.
 *
 * Designed to let callers keep their existing `<table>` untouched — they
 * derive a parallel array of "record cards" by mapping over the same
 * row data. No DOM gymnastics, no CSS hacks.
 */
export type RecordCardField = {
  label: string;
  value: React.ReactNode;
  /** If true, always visible in header (before expand). Max 2 recommended. */
  header?: boolean;
  /** Hide if empty — useful for optional columns. */
  hideIfEmpty?: boolean;
};

export type RecordCardItem = {
  id: string;
  /** Big, scannable title shown as the card's headline (e.g. a date or a name) */
  title: React.ReactNode;
  /** Subtitle under the title — secondary identification (e.g. position) */
  subtitle?: React.ReactNode;
  /** Badge in the top-right corner — e.g. status chip */
  badge?: React.ReactNode;
  /** All the data fields. Fields with `header: true` show in the collapsed state. */
  fields: RecordCardField[];
  /** Actions row rendered at the bottom of the card when expanded */
  actions?: React.ReactNode;
  /** Optional leading element — e.g. a checkbox for bulk selection */
  leading?: React.ReactNode;
  /** Optional click handler for the whole card body (excluding leading + actions) */
  onClick?: () => void;
};

export function RecordCardsView({
  items,
  emptyLabel = "Нет записей.",
  defaultExpandFirst = false,
}: {
  items: RecordCardItem[];
  emptyLabel?: string;
  defaultExpandFirst?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(
    defaultExpandFirst && items[0] ? items[0].id : null
  );

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#dcdfed] bg-[#fafbff] p-5 text-center text-[13px] text-[#6f7282]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2 sm:hidden print:hidden">
      {items.map((item) => {
        const isExpanded = expanded === item.id;
        const headerFields = item.fields.filter((f) => f.header);
        const bodyFields = item.fields.filter(
          (f) => !f.header && !(f.hideIfEmpty && isEmpty(f.value))
        );

        return (
          <div
            key={item.id}
            className="rounded-2xl border border-[#ececf4] bg-white"
          >
            <div className="flex items-center gap-3 px-3 py-3">
              {item.leading ? (
                <span
                  onClick={(event) => event.stopPropagation()}
                  className="shrink-0"
                >
                  {item.leading}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setExpanded(isExpanded ? null : item.id);
                  item.onClick?.();
                }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-[#0b1024]">
                    {item.title}
                  </div>
                  {item.subtitle ? (
                    <div className="truncate text-[12px] text-[#6f7282]">
                      {item.subtitle}
                    </div>
                  ) : null}
                  {headerFields.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#6f7282]">
                      {headerFields.map((f, i) => (
                        <span key={i}>
                          <span className="font-medium text-[#3c4053]">{f.label}:</span>{" "}
                          {f.value || "—"}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {item.badge ? (
                  <span className="shrink-0">{item.badge}</span>
                ) : null}
                <ChevronDown
                  className={`size-4 shrink-0 text-[#6f7282] transition-transform ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>
            {isExpanded ? (
              <div className="space-y-2 border-t border-[#ececf4] p-3 text-[13px]">
                {bodyFields.map((f, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-0.5 rounded-xl bg-[#fafbff] px-3 py-2"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6f7282]">
                      {f.label}
                    </span>
                    <span className="text-[13px] leading-[1.45] text-[#0b1024]">
                      {isEmpty(f.value) ? (
                        <span className="text-[#9b9fb3]">—</span>
                      ) : (
                        f.value
                      )}
                    </span>
                  </div>
                ))}
                {item.actions ? (
                  <div className="pt-2">{item.actions}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function isEmpty(value: React.ReactNode): boolean {
  if (value == null || value === false) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return false;
  return false;
}
