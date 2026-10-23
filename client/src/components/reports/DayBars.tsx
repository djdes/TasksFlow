import { useMemo, useRef, useState } from "react";
import type { DaySummary } from "@shared/history";
import { dayOfWeek, shiftDay } from "@shared/day";

/**
 * Сделано / не сделано по дням — столбики с накоплением.
 *
 * Цвета проверены валидатором dataviz на поверхности карточки в обеих
 * темах: «сделано» — фирменный индиго (--primary), «не сделано» —
 * статусный красный. Зелёный с красным не прошёл проверку на дальтонизм
 * (ΔE 4 у дейтеранопов), поэтому «сделано» не зелёное. Легенда есть
 * всегда, значения дублируются подсказкой (наведение и фокус) и скрытой
 * таблицей для экранного диктора.
 */
const DONE = "hsl(var(--primary))";
const MISSED = "#d03b3b";
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function label(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}, ${WEEKDAYS[dayOfWeek(day)]}`;
}

/** Круглая верхняя граница оси: 7 → 10, 23 → 25, 140 → 150. */
function niceMax(value: number): number {
  if (value <= 4) return Math.max(value, 1);
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * pow) return step * pow;
  }
  return 10 * pow;
}

export function DayBars({ days, from, to, today }: { days: DaySummary[]; from: string; to: string; today: string }) {
  const series = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.day, d]));
    const out: DaySummary[] = [];
    for (let day = from; day <= to; day = shiftDay(day, 1)) {
      out.push(byDay.get(day) ?? { day, done: 0, missed: 0 });
    }
    return out;
  }, [days, from, to]);

  const max = niceMax(Math.max(...series.map((d) => d.done + d.missed), 0));
  const every = series.length <= 10 ? 1 : series.length <= 16 ? 2 : 5;
  const [active, setActive] = useState<number | null>(null);
  const columnsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const current = active !== null ? series[active] : null;

  return (
    <figure className="report-chart" aria-labelledby="report-chart-title">
      <div className="report-chart-head">
        <figcaption id="report-chart-title" className="report-chart-title">По дням</figcaption>
        <div className="report-legend" aria-hidden="true">
          <span><i style={{ background: DONE }} />Сделано</span>
          <span><i style={{ background: MISSED }} />Не сделано</span>
        </div>
      </div>

      <div className="report-plot-wrap">
        <div className="report-axis" aria-hidden="true">
          <span>{max}</span>
          <span>{max / 2 === Math.round(max / 2) ? max / 2 : ""}</span>
          <span>0</span>
        </div>
        <div
          className="report-plot"
          onPointerLeave={() => setActive(null)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(null);
          }}
        >
          <div className="report-grid" aria-hidden="true"><i /><i /><i /></div>
          <div
            className="report-columns"
            role="group"
            aria-label="Столбики по дням: стрелки влево и вправо переключают день"
            style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const from = active ?? series.length - 1;
              const next = Math.min(series.length - 1, Math.max(0, from + (e.key === "ArrowRight" ? 1 : -1)));
              setActive(next);
              columnsRef.current[next]?.focus();
            }}
          >
            {series.map((d, i) => {
              const total = d.done + d.missed;
              return (
                <button
                  key={d.day}
                  ref={(el) => (columnsRef.current[i] = el)}
                  type="button"
                  className="report-column"
                  tabIndex={i === (active ?? series.length - 1) ? 0 : -1}
                  data-active={active === i || undefined}
                  aria-label={`${label(d.day)}: сделано ${d.done}, не сделано ${d.missed}${d.day === today ? ", день ещё идёт" : ""}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                >
                  {total > 0 && (
                    <span className="report-stack" style={{ height: `${((total / max) * 100).toFixed(2)}%` }}>
                      {d.missed > 0 && <span className="report-seg" style={{ flexGrow: d.missed, background: MISSED }} />}
                      {d.done > 0 && <span className="report-seg" style={{ flexGrow: d.done, background: DONE }} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {current && active !== null && (
            <div
              className="report-tooltip"
              role="status"
              style={{ left: `${((active + 0.5) / series.length) * 100}%` }}
              data-edge={active < series.length / 4 ? "start" : active > (series.length * 3) / 4 ? "end" : undefined}
            >
              <div className="report-tooltip-day">
                {label(current.day)}
                {current.day === today ? " · сегодня" : ""}
              </div>
              <div><i style={{ background: DONE }} /><b>{current.done}</b> сделано</div>
              <div><i style={{ background: MISSED }} /><b>{current.missed}</b> не сделано</div>
              {current.done + current.missed > 0 && (
                <div className="report-tooltip-rate">
                  {Math.round((current.done / (current.done + current.missed)) * 100)}% выполнено
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="report-xlabels" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}>
        {series.map((d, i) => (
          <span key={d.day} data-today={d.day === today || undefined}>
            {i % every === 0 || i === series.length - 1 ? Number(d.day.slice(8)) : ""}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Сделано и не сделано по дням</caption>
        <thead>
          <tr><th scope="col">День</th><th scope="col">Сделано</th><th scope="col">Не сделано</th></tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.day}><th scope="row">{label(d.day)}</th><td>{d.done}</td><td>{d.missed}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
