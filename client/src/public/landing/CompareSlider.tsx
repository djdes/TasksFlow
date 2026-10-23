import { useEffect, useRef, useState } from "react";
import { Check, ChevronsLeftRight, Mic } from "lucide-react";
import { MiniPhoto, type PhotoKind } from "./MiniPhoto";
import { prefersReducedMotion, useActiveInView } from "./use-motion";

/**
 * Один и тот же вечер смены: рабочий чат против TasksFlow. Ползунок —
 * нативный range поверх макета: работает мышью, пальцем и с клавиатуры,
 * экранный диктор объявляет положение. При первом показе ползунок один раз
 * качается, подсказывая, что его можно тянуть (если движение разрешено).
 */
const CHAT: Array<{ who: string; text?: string; voice?: string; time: string; me?: boolean }> = [
  { who: "Ольга", text: "Витрину кто-нибудь протёр?", time: "21:02" },
  { who: "Сергей", text: "Да вроде", time: "21:05", me: true },
  { who: "Ольга", text: "Фото скиньте", time: "21:06" },
  { who: "Мария", voice: "0:42", time: "21:20" },
  { who: "Олег", text: "Кассу кто закрывал??", time: "21:31" },
  { who: "Сергей", text: "Завтра доделаю", time: "21:47", me: true },
];

const DONE: Array<{ t: string; who: string; photo?: PhotoKind }> = [
  { t: "Протереть витрину", who: "Сергей", photo: "showcase" },
  { t: "Закрыть кассу", who: "Олег" },
  { t: "Выложить товар", who: "Мария", photo: "shelf" },
  { t: "Проверить ценники", who: "Ольга", photo: "tags" },
];

const HINT: Array<[number, number]> = [[0, 50], [0.32, 28], [0.72, 72], [1, 50]];

export function CompareSlider() {
  const [pos, setPos] = useState(50);
  const [ref, inView] = useActiveInView<HTMLDivElement>(0.55);
  const hinted = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    if (!inView || hinted.current || touched.current || prefersReducedMotion()) return;
    hinted.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (touched.current) return;
      const p = Math.min(1, (now - start) / 2000);
      const k = HINT.findIndex(([at]) => at >= p);
      const [a0, v0] = HINT[Math.max(0, k - 1)];
      const [a1, v1] = HINT[k];
      const local = a1 === a0 ? 1 : (p - a0) / (a1 - a0);
      const eased = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
      setPos(Math.round(v0 + (v1 - v0) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView]);

  return (
    <div ref={ref} className="compare-wrap">
      <div className="compare-legend" aria-hidden="true"><span>Без TasksFlow</span><span>С TasksFlow</span></div>
      <div className="compare" style={{ ["--pos" as string]: `${pos}%` }}>
      <div className="compare-pane compare-before" aria-hidden="true">
        <div className="chat-head">
          <span className="chat-avatar">См</span>
          <div className="leading-tight">
            <div className="chat-title">Чат «Смена»</div>
            <div className="chat-sub">14 участников</div>
          </div>
          <span className="chat-unread">+23</span>
        </div>
        <div className="chat-body">
          {CHAT.map((m, i) => (
            <div key={i} className={`chat-msg ${m.me ? "is-me" : ""}`}>
              {!m.me && <span className="chat-who">{m.who}</span>}
              {m.voice ? (
                <span className="chat-voice"><Mic className="w-3.5 h-3.5" /><span className="chat-wave" />{m.voice}</span>
              ) : m.text}
              <span className="chat-time tabular-nums">{m.time}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="compare-pane compare-after" aria-hidden="true">
        <div className="tf-head">
          <div className="leading-tight">
            <div className="chat-title">Смена сегодня</div>
            <div className="chat-sub">Магазин на Ленина</div>
          </div>
          <span className="tf-done-pill"><Check className="w-3.5 h-3.5" strokeWidth={3} /> 4 из 4</span>
        </div>
        <ul className="tf-body">
          {DONE.map((d) => (
            <li key={d.t} className="tf-row">
              <span className="tf-check"><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>
              <span className="min-w-0 flex-1">
                <span className="tf-row-title">{d.t}</span>
                <span className="tf-row-who">{d.who}{d.photo ? " · с фото" : ""}</span>
              </span>
              {d.photo && <span className="tf-thumb"><MiniPhoto kind={d.photo} className="w-full h-full" /></span>}
            </li>
          ))}
        </ul>
        <div className="tf-foot">Отчёт принят · премия начислена</div>
      </div>

      <span className="compare-handle" aria-hidden="true"><span><ChevronsLeftRight className="w-4 h-4" /></span></span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => { touched.current = true; setPos(Number(e.target.value)); }}
        onPointerDown={() => { touched.current = true; }}
        className="compare-range"
        aria-label="Сравнение: слева рабочий чат без TasksFlow, справа смена в TasksFlow"
        aria-valuetext={`Чат виден на ${pos}%`}
      />
      </div>
    </div>
  );
}
