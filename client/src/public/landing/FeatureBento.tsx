import type { PointerEvent, ReactNode } from "react";
import { ArrowRight, BarChart3, Camera, Check, ClipboardCheck, Coins, Repeat, ShieldCheck } from "lucide-react";
import { MiniPhoto } from "./MiniPhoto";

/**
 * Возможности сеткой разного размера: у каждой карточки свой мини-макет
 * продукта. За курсором тянется мягкий «прожектор» (CSS-переменные --mx/--my),
 * на тач-устройствах его нет — карточки остаются статичными.
 */
function spotlight(e: PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

function Card({ className = "", icon: Icon, title, text, children, delay }: {
  className?: string;
  icon: typeof Camera;
  title: string;
  text: string;
  children: ReactNode;
  delay: number;
}) {
  return (
    <article data-reveal style={{ transitionDelay: `${delay}ms` }} onPointerMove={spotlight} className={`bento-card group ${className}`}>
      <div className="bento-visual" aria-hidden="true">{children}</div>
      <div className="bento-copy">
        <div className="bento-icon"><Icon className="w-5 h-5" /></div>
        <h3 className="bento-title">{title}</h3>
        <p className="bento-text">{text}</p>
      </div>
    </article>
  );
}

const PHOTOS = [
  { kind: "showcase" as const, label: "Витрина" },
  { kind: "shelf" as const, label: "Выкладка" },
  { kind: "delivery" as const, label: "Поставка" },
];

const PEOPLE = [
  { n: "Сергей", v: 92 },
  { n: "Мария", v: 76 },
  { n: "Олег", v: 58 },
  { n: "Ирина", v: 84 },
];

export function FeatureBento() {
  return (
    <div className="bento">
      <Card className="bento-photo" icon={Camera} title="Фото-отчёты" text="Сделано — значит есть фото. Никаких «сделал, честно»." delay={0}>
        <div className="bento-photos">
          {PHOTOS.map((p) => (
            <figure key={p.kind} className="bento-snap">
              <MiniPhoto kind={p.kind} className="w-full h-full" />
              <figcaption><Check className="w-3 h-3" strokeWidth={3} />{p.label}</figcaption>
            </figure>
          ))}
        </div>
        <div className="bento-photo-meta"><span className="bento-dot" /> Магазин на Ленина · 3 фото за смену</div>
      </Card>

      <Card className="bento-checklist" icon={ClipboardCheck} title="Задачи и чек-листы" text="Понятный список дел на смену для каждого сотрудника." delay={70}>
        <ul className="bento-list">
          {["Включить кассы", "Проверить холодильники", "Вынести мусор"].map((t, i) => (
            <li key={t} className={i < 2 ? "is-done" : ""}><span className="bento-box"><Check className="w-3 h-3" strokeWidth={3} /></span>{t}</li>
          ))}
        </ul>
      </Card>

      <Card className="bento-repeat" icon={Repeat} title="Повторяющиеся задачи" text="Ежедневная рутина ставится сама, без напоминаний." delay={140}>
        <div className="bento-week">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d, i) => <span key={d} className={i < 5 ? "is-on" : ""} style={{ transitionDelay: `${i * 40}ms` }}>{d}</span>)}
        </div>
        <div className="bento-caption tabular-nums">Каждый будний день · 08:00</div>
      </Card>

      <Card className="bento-bonus" icon={Coins} title="Премии за результат" text="Прозрачная мотивация: бонус приходит за выполненное." delay={0}>
        <div className="bento-money tabular-nums">+300 <span>₽</span></div>
        <div className="bento-caption">за 4 задачи с фото</div>
      </Card>

      <Card className="bento-verify" icon={ShieldCheck} title="Проверка «сдал — принял»" text="Старший подтверждает работу. Премия — только после проверки." delay={70}>
        <div className="bento-flow">
          <span className="bento-pill">Сдал</span>
          <ArrowRight className="bento-arrow w-4 h-4" />
          <span className="bento-pill is-ok"><Check className="w-3.5 h-3.5" strokeWidth={3} /> Принял</span>
        </div>
      </Card>

      <Card className="bento-report" icon={BarChart3} title="Отчёты по людям" text="Видно, кто молодец, а кто отстаёт. В реальном времени." delay={140}>
        <div className="bento-bars">
          {PEOPLE.map((p) => (
            <div key={p.n} className="bento-bar-row">
              <span>{p.n}</span>
              <span className="bento-bar"><i style={{ width: `${p.v}%` }} /></span>
              <span className="tabular-nums">{p.v}%</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
