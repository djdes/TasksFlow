import { useEffect, useState, type KeyboardEvent } from "react";
import { Camera, Check, Coins, RotateCcw } from "lucide-react";
import { MiniPhoto } from "./MiniPhoto";
import { prefersReducedMotion, useActiveInView } from "./use-motion";

/**
 * «Как это работает»: три шага-вкладки и экран продукта рядом. Пока блок
 * на экране, шаги переключаются сами (полоса под шагом — таймер), клик
 * или стрелки фиксируют выбранный шаг. Каждый экран проигрывает свой
 * короткий сценарий при открытии. Без движения всё видно сразу в
 * конечном состоянии, автопереключения нет.
 */
const STEPS = [
  { key: "create", who: "Руководитель", title: "Поставьте задачи", text: "Напишите, что нужно сделать. Добавьте чек-лист и фото-пример — за пару минут." },
  { key: "do", who: "Сотрудник", title: "Сотрудник выполняет", text: "Видит список на день в телефоне. Отмечает «готово» и прикладывает фото." },
  { key: "check", who: "Руководитель", title: "Вы контролируете", text: "Видите, что и как сделано. Подтверждаете и начисляете премию." },
] as const;

const TASK = "Протереть витрину с напитками";
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function useTyped(text: string, run: boolean, startMs = 350, stepMs = 45) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!run) { setShown(text); return; }
    setShown("");
    let i = 0;
    let timer = window.setTimeout(function tick() {
      i += 1;
      setShown(text.slice(0, i));
      if (i < text.length) timer = window.setTimeout(tick, stepMs);
    }, startMs);
    return () => window.clearTimeout(timer);
  }, [text, run, startMs, stepMs]);
  return shown;
}

type ScreenProps = { active: boolean; animate: boolean };

function ScreenCreate({ active, animate }: ScreenProps) {
  const typed = useTyped(TASK, active && animate);
  return (
    <div className="scr" data-screen="create">
      <div className="scr-top"><span>Новая задача</span><span className="scr-muted">черновик</span></div>
      <div className="scr-field">
        <span className="scr-label">Что сделать</span>
        <div className="scr-input">{typed}<i className="scr-caret" aria-hidden="true" /></div>
      </div>
      <div className="scr-field">
        <span className="scr-label">Кому</span>
        <div className="scr-person"><span className="scr-av">СП</span>Сергей Петров · кассир</div>
      </div>
      <div className="scr-row"><span><Camera className="w-4 h-4" /> Фото обязательно</span><span className="scr-switch" /></div>
      <div className="scr-field">
        <span className="scr-label">Повтор</span>
        <div className="scr-days">
          {DAYS.map((d, i) => <span key={d} className={i < 6 ? "is-on" : ""} style={{ animationDelay: `${2100 + i * 70}ms` }}>{d}</span>)}
        </div>
      </div>
      <div className="scr-row"><span><Coins className="w-4 h-4" /> Премия</span><b className="scr-bonus">+150 ₽</b></div>
      <div className="scr-btn scr-press">Создать задачу</div>
    </div>
  );
}

function ScreenDo(_: ScreenProps) {
  return (
    <div className="scr" data-screen="do">
      <div className="scr-top"><span>Сергей · сегодня</span><span className="scr-pill">3 задачи</span></div>
      <div className="scr-task">
        <b>{TASK}</b>
        <div className="scr-chips"><span className="is-amber"><Camera className="w-3 h-3" /> Фото</span><span className="is-green">+150 ₽</span></div>
      </div>
      <div className="scr-camera">
        <MiniPhoto kind="showcase" className="scr-camera-img" />
        <span className="scr-vf" aria-hidden="true"><i /><i /><i /><i /></span>
        <span className="scr-flash" aria-hidden="true" />
        <span className="scr-shot-ok"><Check className="w-3.5 h-3.5" strokeWidth={3} /> Фото добавлено</span>
      </div>
      <div className="scr-shutter-row"><span className="scr-shutter" aria-hidden="true" /></div>
      <div className="scr-btn scr-swap"><span>Готово — отправить</span><span><Check className="w-4 h-4" strokeWidth={3} /> На проверке</span></div>
    </div>
  );
}

const TEAM = [
  { n: "Сергей Петров", d: 4, t: 4 },
  { n: "Мария Иванова", d: 3, t: 5 },
  { n: "Олег Ким", d: 2, t: 3 },
];

function ScreenCheck(_: ScreenProps) {
  return (
    <div className="scr" data-screen="check">
      <div className="scr-top"><span>На проверке</span><span className="scr-pill">1</span></div>
      <div className="scr-review">
        <MiniPhoto kind="showcase" className="scr-review-img" />
        <div className="min-w-0">
          <b>{TASK}</b>
          <div className="scr-muted">Сергей Петров · 08:42</div>
        </div>
      </div>
      <div className="scr-actions"><span className="scr-ghost">Вернуть</span><span className="scr-ok scr-press">Принять</span></div>
      <div className="scr-accepted"><Check className="w-4 h-4" strokeWidth={3} /> Принято · +150 ₽ Сергею</div>
      <div className="scr-team">
        <span className="scr-label">Смена сегодня</span>
        {TEAM.map((p, i) => (
          <div key={p.n} className="scr-team-row">
            <span className="scr-team-name">{p.n}</span>
            <span className="scr-team-bar"><i style={{ width: `${(p.d / p.t) * 100}%`, animationDelay: `${2100 + i * 120}ms` }} /></span>
            <span className="scr-team-num tabular-nums">{p.d}/{p.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StepsShowcase() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [animate, setAnimate] = useState(false);
  const [ref, inView] = useActiveInView<HTMLDivElement>(0.3);

  // Сценарии экранов стартуют при первом показе блока, а не при загрузке.
  const [seen, setSeen] = useState(false);
  useEffect(() => { setAnimate(!prefersReducedMotion()); }, []);
  useEffect(() => { if (inView) setSeen(true); }, [inView]);

  const autoplay = auto && animate;
  const select = (i: number) => { setActive(i); setAuto(false); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + STEPS.length) % STEPS.length;
    select(next);
    document.getElementById(`step-tab-${STEPS[next].key}`)?.focus();
  };

  return (
    <div ref={ref} className={`steps ${seen ? "is-seen" : ""} ${autoplay ? "is-auto" : ""} ${autoplay && inView ? "is-playing" : ""}`}>
      <div role="tablist" aria-label="Как работает TasksFlow" aria-orientation="vertical" className="steps-tabs" onKeyDown={onKey}>
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            id={`step-tab-${s.key}`}
            aria-selected={i === active}
            aria-controls="steps-panel"
            tabIndex={i === active ? 0 : -1}
            onClick={() => select(i)}
            className={`step-tab ${i === active ? "is-active" : ""} ${i < active ? "is-past" : ""}`}
          >
            <span className="step-num" aria-hidden="true">{i + 1}</span>
            <span className="step-copy">
              <span className="step-who">{s.who}</span>
              <span className="step-title">{s.title}</span>
              <span className="step-text"><span>{s.text}</span></span>
            </span>
            <span className="step-bar" aria-hidden="true">
              <span key={`${i}-${active}`} onAnimationEnd={i === active && autoplay ? () => setActive((a) => (a + 1) % STEPS.length) : undefined} />
            </span>
          </button>
        ))}
        {!auto && animate && (
          <button type="button" className="steps-replay" onClick={() => { setActive(0); setAuto(true); }}>
            <RotateCcw className="w-3.5 h-3.5" /> Листать автоматически
          </button>
        )}
      </div>

      <div className="steps-stage" id="steps-panel" role="tabpanel" aria-labelledby={`step-tab-${STEPS[active].key}`}>
        <div className="steps-device">
          {[ScreenCreate, ScreenDo, ScreenCheck].map((Screen, i) => (
            <div key={i} className={`steps-screen ${i === active ? "is-active" : ""}`} aria-hidden={i !== active}>
              <Screen active={i === active} animate={animate && seen} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
