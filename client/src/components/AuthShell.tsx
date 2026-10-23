import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Camera, Check, Coins, Smartphone } from "lucide-react";
import { useMotionPreference } from "@/contexts/MotionContext";
import { BrandMark } from "@/components/BrandMark";

/**
 * Общий каркас входа, регистрации и приглашения: на desktop слева панель
 * бренда с обещанием продукта и «живой» карточкой смены, справа форма; на
 * mobile — компактная цветная шапка и карточка формы. Стили — login-* в
 * workspace.css.
 */
const BENEFITS = [
  { icon: Smartphone, text: "Задачи на смену — в телефоне" },
  { icon: Camera, text: "Фото-отчёт вместо «сделал, честно»" },
  { icon: Coins, text: "Премия за выполненное" },
];

const LIVE_ROWS = ["Открыть смену", "Протереть витрину", "Проверить ценники"];

/** Маленькая карточка смены: третья задача отмечается один раз при входе. */
function LiveShiftCard() {
  return (
    <div className="login-live" aria-hidden="true">
      <div className="login-live-head">
        <span>Магазин на Ленина</span>
        <b>3 из 3</b>
      </div>
      <div className="login-live-track"><span /></div>
      {LIVE_ROWS.map((row, i) => (
        <div key={row} className={`login-live-row ${i === 2 ? "login-live-row--late" : ""}`}>
          <span className="login-live-check"><Check strokeWidth={3} /></span>
          {row}
          {i === 1 ? <span className="login-live-photo"><Camera />фото</span> : null}
        </div>
      ))}
      <div className="login-live-bonus"><Coins />+300 ₽ премия</div>
    </div>
  );
}

type Props = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
};

export function AuthShell({ title, subtitle, children }: Props) {
  const { reduced } = useMotionPreference();
  return (
    <div className="login-screen">
      <motion.aside
        className="login-brand"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="login-brand-inner">
          <a href="/" className="login-logo" aria-label="TasksFlow — на главную">
            <span className="login-logo-mark" aria-hidden="true"><BrandMark onColor /></span>
            <span className="login-logo-word">Tasks<span>Flow</span></span>
          </a>
          <h1 className="login-title">Контроль производственных процессов</h1>
          <ul className="login-benefits">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text}><span aria-hidden="true"><Icon /></span>{text}</li>
            ))}
          </ul>
          <LiveShiftCard />
        </div>
      </motion.aside>

      <main className="login-panel">
        <motion.div
          className="login-card"
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.35, ease: [0.2, 0.8, 0.2, 1], delay: reduced ? 0 : 0.08 }}
        >
          <div className="login-card-head">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {children}
        </motion.div>
      </main>
    </div>
  );
}
