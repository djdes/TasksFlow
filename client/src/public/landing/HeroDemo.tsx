import { useEffect, useState } from "react";
import { Camera, Check, RotateCcw } from "lucide-react";
import { MiniPhoto, type PhotoKind } from "./MiniPhoto";
import { prefersReducedMotion, useActiveInView } from "./use-motion";

/**
 * Живой макет смены в hero. Сам проигрывает сценарий: сотрудник отмечает
 * задачи, снимает фото, отправляет отчёт, руководитель принимает, премия
 * начисляется. Клик по задаче отдаёт управление человеку — демо замирает
 * и предлагает показать сценарий заново. Без движения (reduced motion)
 * демо не играет само, но остаётся кликабельным.
 * SSR-safe: стартовое состояние детерминировано, таймеры — только в эффектах.
 */
type Item = { t: string; photo?: PhotoKind; done: boolean; shot: boolean };
type Demo = { items: Item[]; shooting: number | null; snapped: number | null; flash: number; sent: boolean };

const INITIAL: Demo = {
  items: [
    { t: "Открыть смену", done: true, shot: false },
    { t: "Протереть витрину", photo: "showcase", done: false, shot: false },
    { t: "Выложить товар по полкам", done: false, shot: false },
    { t: "Проверить ценники", photo: "tags", done: false, shot: false },
  ],
  shooting: null,
  snapped: null,
  flash: 0,
  sent: false,
};

const BONUS = 300;

function snap(s: Demo, i: number): Demo {
  return {
    ...s,
    shooting: null,
    snapped: i,
    flash: s.flash + 1,
    items: s.items.map((it, k) => (k === i ? { ...it, shot: true, done: true } : it)),
  };
}
function check(s: Demo, i: number): Demo {
  return { ...s, items: s.items.map((it, k) => (k === i ? { ...it, done: true } : it)) };
}
function sendAll(s: Demo): Demo {
  return { ...s, shooting: null, sent: true, items: s.items.map((it) => ({ ...it, done: true, shot: !!it.photo })) };
}

// [пауза перед шагом, мс; шаг]
const SCRIPT: Array<[number, (s: Demo) => Demo]> = [
  [1500, (s) => ({ ...s, shooting: 1 })],
  [1150, (s) => snap(s, 1)],
  [1050, (s) => check(s, 2)],
  [950, (s) => ({ ...s, shooting: 3 })],
  [1150, (s) => snap(s, 3)],
  [1100, sendAll],
  [4200, () => INITIAL],
];

function useCountUp(target: number, run: boolean, ms = 750) {
  const [value, setValue] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) { setValue(target); return; }
    setValue(0);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return value;
}

export function HeroDemo() {
  const [state, setState] = useState<Demo>(INITIAL);
  const [auto, setAuto] = useState(true);
  const [step, setStep] = useState(0);
  const [canAnimate, setCanAnimate] = useState(false);
  const [ref, active] = useActiveInView<HTMLDivElement>(0.4);

  useEffect(() => { setCanAnimate(!prefersReducedMotion()); }, []);

  useEffect(() => {
    if (!auto || !active || !canAnimate) return;
    const [wait, run] = SCRIPT[step];
    const timer = window.setTimeout(() => {
      setState(run);
      setStep((n) => (n + 1) % SCRIPT.length);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [auto, active, canAnimate, step]);

  const takeOver = () => { if (auto) setAuto(false); };
  const toggle = (i: number) => {
    takeOver();
    setState((s) => {
      const it = s.items[i];
      if (it.done) return { ...s, sent: false, items: s.items.map((x, k) => (k === i ? { ...x, done: false, shot: false } : x)) };
      return it.photo ? snap({ ...s, sent: false }, i) : check({ ...s, sent: false }, i);
    });
  };
  const submit = () => { takeOver(); setState(sendAll); };
  const replay = () => { setState(INITIAL); setStep(0); setAuto(true); };

  const doneCount = state.items.filter((i) => i.done).length;
  const total = state.items.length;
  const bonus = useCountUp(BONUS, state.sent && canAnimate);
  const C = 2 * Math.PI * 17;

  return (
    <div ref={ref} className="hero-demo" aria-label="Пример: задачи сотрудника на смену">
      <div className="hero-demo-halo" aria-hidden="true" />

      <div className="demo-card">
        <div className="demo-head">
          <span className="demo-avatar" aria-hidden="true">СП</span>
          <div className="min-w-0 flex-1">
            <div className="demo-eyebrow">Магазин на Ленина · до 20:00</div>
            <div className="demo-title">Задачи на сегодня</div>
          </div>
          <div className="demo-ring" role="img" aria-label={`Выполнено ${doneCount} из ${total}`}>
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="17" className="demo-ring-track" />
              <circle cx="20" cy="20" r="17" className="demo-ring-fill" strokeDasharray={C} strokeDashoffset={C * (1 - doneCount / total)} />
            </svg>
            <span className="tabular-nums">{doneCount}/{total}</span>
          </div>
        </div>

        <ul className="demo-list">
          {state.items.map((it, i) => (
            <li key={it.t}>
              <button type="button" onClick={() => toggle(i)} aria-pressed={it.done} className={`demo-row ${it.done ? "is-done" : ""} ${state.shooting === i ? "is-shooting" : ""}`}>
                <span className="demo-check" aria-hidden="true">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
                <span className="demo-row-text">{it.t}</span>
                {it.photo && (it.shot ? (
                  <span className="demo-thumb" key={`thumb-${i}`}>
                    <MiniPhoto kind={it.photo} className="w-full h-full" />
                  </span>
                ) : (
                  <span className="demo-photo-chip"><Camera className="w-3 h-3" /> фото</span>
                ))}
                {state.shooting === i && <span className="demo-vf" aria-hidden="true"><i /><i /><i /><i /></span>}
                {state.snapped === i && <span className="demo-flash" key={`flash-${state.flash}`} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>

        <button type="button" onClick={submit} className={`demo-submit ${state.sent ? "is-sent" : ""}`}>
          {state.sent ? <><Check className="w-4 h-4" strokeWidth={3} /> Отчёт отправлен</> : "Отправить отчёт"}
        </button>
      </div>

      <div className={`demo-float demo-boss ${state.sent ? "is-ok" : ""}`}>
        <span className="demo-boss-avatar" aria-hidden="true">А</span>
        <div className="leading-tight">
          <div className="demo-float-label">{state.sent ? "Анна приняла отчёт" : "Анна видит смену"}</div>
          <div className="demo-float-value">
            {state.sent ? <>Принято <Check className="inline w-3.5 h-3.5 -mt-0.5" strokeWidth={3} /></> : <><span className="demo-live" aria-hidden="true" />{doneCount} из {total} готово</>}
          </div>
        </div>
      </div>

      <div className={`demo-float demo-bonus ${state.sent ? "is-on" : ""}`} aria-hidden={!state.sent}>
        <span className="demo-bonus-icon"><Check className="w-4 h-4" strokeWidth={3} /></span>
        <div className="leading-tight">
          <div className="demo-float-label">Премия начислена</div>
          <div className="demo-float-value tabular-nums">+{bonus} ₽</div>
        </div>
      </div>

      {/* Место под кнопку зарезервировано всегда — появление не двигает hero. */}
      <button type="button" onClick={replay} className={`demo-replay ${!auto && canAnimate ? "is-visible" : ""}`}>
        <RotateCcw className="w-3.5 h-3.5" /> Показать сценарий заново
      </button>
    </div>
  );
}
