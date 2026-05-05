import { useEffect, useState } from "react";
import { Award, Flame, Sparkles, Trophy, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Portal } from "@/components/Portal";

/**
 * Модал «Поздравляем!» при достижении milestone-стрика. Срабатывает
 * один раз на каждый milestone (7, 14, 30, 60, 100, 200) — после
 * закрытия флаг tf_streak_achieved_${userId}_${milestone} = "true",
 * повторно не показываем.
 *
 * Внутри: трофей, число дней, мотивирующий текст. Закрывается тапом
 * на крестик или на backdrop.
 */

const MILESTONES = [7, 14, 30, 60, 100, 200] as const;

type Milestone = (typeof MILESTONES)[number];

const MILESTONE_DESCRIPTIONS: Record<
  Milestone,
  { title: string; subtitle: string; emoji: string; tone: string }
> = {
  7: {
    title: "Неделя подряд!",
    subtitle: "Семь дней без пропуска — ты в ритме смены.",
    emoji: "🔥",
    tone: "from-orange-400 to-red-500",
  },
  14: {
    title: "Две недели!",
    subtitle: "Профессиональная привычка. Так держать.",
    emoji: "⭐",
    tone: "from-amber-400 to-orange-500",
  },
  30: {
    title: "Целый месяц!",
    subtitle: "Месяц подряд — это уровень. Руководитель знает.",
    emoji: "🏆",
    tone: "from-yellow-400 to-amber-600",
  },
  60: {
    title: "Два месяца!",
    subtitle: "Уже легенда смены. Молодец.",
    emoji: "💎",
    tone: "from-cyan-400 to-blue-600",
  },
  100: {
    title: "100 дней!",
    subtitle: "Сто дней работы без перерыва. Это эталон.",
    emoji: "👑",
    tone: "from-violet-500 to-purple-700",
  },
  200: {
    title: "200 дней!",
    subtitle: "Феноменально. О тебе ходят легенды по компании.",
    emoji: "🌟",
    tone: "from-pink-500 to-rose-700",
  },
};

function storageKey(userId: number | null | undefined, m: Milestone): string {
  return `tf_streak_achieved_${userId ?? "anon"}_${m}`;
}

type Props = {
  userId: number | null | undefined;
  streakDays: number;
};

export function StreakAchievement({ userId, streakDays }: Props) {
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null);

  useEffect(() => {
    if (!userId || streakDays < 1) return;
    // Идём от высокого к низкому — если достиг 30 и ещё не показывали,
    // показываем 30 (а не 7), чтобы не спамить старыми milestones.
    for (let i = MILESTONES.length - 1; i >= 0; i -= 1) {
      const m = MILESTONES[i];
      if (streakDays >= m) {
        const seen = (() => {
          try {
            return window.localStorage.getItem(storageKey(userId, m)) === "true";
          } catch {
            return false;
          }
        })();
        if (!seen) {
          setActiveMilestone(m);
          return;
        }
      }
    }
  }, [userId, streakDays]);

  function dismiss() {
    if (activeMilestone) {
      try {
        window.localStorage.setItem(storageKey(userId, activeMilestone), "true");
      } catch {
        /* ignore */
      }
    }
    setActiveMilestone(null);
  }

  return (
    <Portal>
    <AnimatePresence>
      {activeMilestone ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            className={`relative max-w-sm w-full rounded-3xl bg-white dark:bg-slate-900 p-8 text-center shadow-2xl overflow-hidden`}
            initial={{ scale: 0.7, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-3 top-3 w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Confetti backdrop */}
            <div
              className={`absolute -top-20 -inset-x-20 h-40 bg-gradient-to-br ${MILESTONE_DESCRIPTIONS[activeMilestone].tone} opacity-30 blur-3xl pointer-events-none`}
            />

            <div className="relative">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 18,
                  delay: 0.1,
                }}
                className={`mx-auto w-24 h-24 rounded-3xl bg-gradient-to-br ${MILESTONE_DESCRIPTIONS[activeMilestone].tone} flex items-center justify-center text-5xl shadow-2xl`}
              >
                {MILESTONE_DESCRIPTIONS[activeMilestone].emoji}
              </motion.div>

              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                Награда
              </div>

              <h2 className="mt-4 text-2xl font-bold text-foreground">
                {MILESTONE_DESCRIPTIONS[activeMilestone].title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {MILESTONE_DESCRIPTIONS[activeMilestone].subtitle}
              </p>

              <div className="mt-5 inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200/50 dark:border-amber-800/40">
                <Flame className="w-6 h-6 text-orange-500" />
                <div className="text-left">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    Стрик
                  </div>
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {streakDays} {streakDays === 1 ? "день" : streakDays < 5 ? "дня" : "дней"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={dismiss}
                className="mt-6 w-full h-12 rounded-2xl bg-gradient-to-r from-primary to-primary/90 text-white font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Trophy className="w-5 h-5" />
                Продолжить смену
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
    </Portal>
  );
}
