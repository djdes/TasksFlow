import { useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import {
  Award,
  Flame,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import {
  completedHint,
  streakHint,
  todayHint,
} from "@/lib/streak-hint";

/**
 * Hero-блок сводки на главной. Заменяет minimal `progress-card`
 * четырьмя «живыми» плитками: что нужно сделать сегодня, сколько
 * сделано, сколько забрал коллега (для воркера) или сколько в очереди
 * (для админа), и текущий бонус-баланс.
 *
 * Анимации:
 *   - Стаггер-вход 80ms между плитками (ease-out-quint)
 *   - Числа считаются плавно от 0 к финалу (~600ms spring)
 *   - На hover плитка чуть приподнимается с ring-glow
 *   - Прогресс-кольцо вокруг иконки «Сегодня» рисуется по
 *     stroke-dashoffset с easeOut
 */

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const tileVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.42, ease: EASE_OUT_QUINT },
  },
};

function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.65,
      ease: EASE_OUT_QUINT,
    });
    const unsub = rounded.on("change", (latest) => setDisplay(latest));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, motionValue, rounded]);

  return <>{display}</>;
}

type Tone = "primary" | "success" | "amber" | "slate";

const TONE_STYLES: Record<
  Tone,
  { bg: string; iconBg: string; iconColor: string; ring: string }
> = {
  primary: {
    bg: "from-primary/12 to-primary/6 border-primary/15",
    iconBg: "bg-primary/15 dark:bg-primary/25",
    iconColor: "text-primary dark:text-[#a8b3ff]",
    ring: "ring-primary/30",
  },
  success: {
    bg: "from-emerald-500/12 to-emerald-500/5 border-emerald-500/20",
    iconBg: "bg-emerald-500/15 dark:bg-emerald-500/25",
    iconColor: "text-emerald-600 dark:text-emerald-300",
    ring: "ring-emerald-400/30",
  },
  amber: {
    bg: "from-amber-400/15 to-amber-500/8 border-amber-400/25",
    iconBg: "bg-amber-400/20 dark:bg-amber-400/30",
    iconColor: "text-amber-700 dark:text-amber-300",
    ring: "ring-amber-400/35",
  },
  slate: {
    bg: "from-slate-200/40 to-slate-100/40 border-slate-300/50 dark:border-white/10",
    iconBg: "bg-slate-200/60 dark:bg-white/10",
    iconColor: "text-slate-600 dark:text-slate-300",
    ring: "ring-slate-300/50",
  },
};

type TileProps = {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
  tone: Tone;
  /** 0..1 для маленького кольца прогресса вокруг иконки. */
  progress?: number;
  /** Подсветка-«пульс» — для бонус-баланса с положительным числом. */
  pulse?: boolean;
};

function StatTile({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
  tone,
  progress,
  pulse,
}: TileProps) {
  const t = TONE_STYLES[tone];

  return (
    <motion.div
      variants={tileVariants}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      className={`stat-tile bg-gradient-to-br ${t.bg}`}
    >
      {/* Number-first раскладка: маленький цветной icon-чип сверху,
          крупное число (Onest, tabular), затем подпись и hint. Раньше
          icon+label были в одной строке flex — на 80px ширине метка
          обрезалась до «СЕГОДН». Теперь каждый элемент — своя строка
          без конкуренции за горизонталь. */}
      <div className={`stat-tile-icon ${t.iconBg} ${t.iconColor}`}>
        {progress !== undefined ? (
          <svg
            viewBox="0 0 36 36"
            className="absolute inset-0 -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="2.5"
              stroke="currentColor"
              strokeOpacity="0.18"
            />
            <motion.circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="2.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 15}
              initial={{ strokeDashoffset: 2 * Math.PI * 15 }}
              animate={{
                strokeDashoffset:
                  2 * Math.PI * 15 * (1 - Math.max(0, Math.min(1, progress))),
              }}
              transition={{ duration: 1.05, ease: EASE_OUT_QUINT, delay: 0.15 }}
            />
          </svg>
        ) : null}
        <Icon className="stat-tile-icon-glyph relative" strokeWidth={2.2} />
        {pulse ? <span className={`stat-tile-pulse ${t.ring}`} /> : null}
      </div>
      <div className="stat-tile-value">
        <AnimatedNumber value={value} />
        {suffix ? (
          <span className="stat-tile-suffix">{suffix}</span>
        ) : null}
      </div>
      <div className="stat-tile-label">{label}</div>
      {hint ? <div className="stat-tile-hint">{hint}</div> : null}
    </motion.div>
  );
}

type Props = {
  isAdmin: boolean;
  totalCount: number;
  completedCount: number;
  claimedCount: number;
  bonusBalance: number;
  /**
   * Дней подряд с закрытой хотя бы одной задачей. Считается локально
   * через `useStreak` (см. client/src/hooks/use-streak.ts). Только
   * для воркеров — админу неинтересно.
   */
  streakDays?: number;
  onBonusClick?: () => void;
};

export function StatHero({
  isAdmin,
  totalCount,
  completedCount,
  claimedCount,
  bonusBalance,
  streakDays,
  onBonusClick,
}: Props) {
  const progress = totalCount > 0 ? completedCount / totalCount : 0;
  const remaining = Math.max(0, totalCount - completedCount);

  return (
    <motion.div
      className="stat-hero"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <StatTile
        icon={Target}
        label="Сегодня"
        value={remaining}
        hint={todayHint(remaining, totalCount)}
        tone="primary"
        progress={progress}
      />
      <StatTile
        icon={Trophy}
        label="Сделано"
        value={completedCount}
        hint={completedHint(progress, totalCount)}
        tone="success"
      />
      {claimedCount > 0 ? (
        <StatTile
          icon={Flame}
          label={isAdmin ? "Забрано" : "Опередили"}
          value={claimedCount}
          hint={isAdmin ? "race-for-bonus" : "коллеги быстрее"}
          tone="slate"
        />
      ) : null}
      {/* Streak плитка — только воркеру и только когда уже хотя бы день
          в зачёте. Не нагнетаем «0 дней» — это демотивирует. С 1 дня
          и выше показываем как мягкую плашку «5 дней подряд». */}
      {!isAdmin && typeof streakDays === "number" && streakDays >= 1 ? (
        <StatTile
          icon={Award}
          label="Стрик"
          value={streakDays}
          hint={streakHint(streakDays)}
          tone="primary"
        />
      ) : null}
      {/* Премия больше НЕ тут — вынесена в шапку (бейдж рядом с именем).
          Не дублируем плитку, чтобы не было двух мест с одним балансом. */}
    </motion.div>
  );
}
