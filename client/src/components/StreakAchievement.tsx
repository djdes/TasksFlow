import { useEffect, useState } from "react";
import { Flame, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { plural } from "@/lib/i18n";
import {
  MILESTONES,
  type Milestone,
  pickHighestUnseenMilestone,
} from "@/lib/streak-milestones";

/**
 * Модал «Поздравляем!» при достижении milestone-стрика. Срабатывает
 * один раз на каждый milestone (7, 14, 30, 60, 100, 200) — после
 * закрытия флаг tf_streak_achieved_${userId}_${milestone} = "true",
 * повторно не показываем.
 *
 * Внутри: трофей, число дней, мотивирующий текст. Закрывается тапом
 * на крестик или на backdrop.
 */


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
    if (!userId) return;
    // Собираем set уже-показанных milestones и просим pure-функцию
    // выбрать что показать.
    const seen = new Set<number>();
    for (const m of MILESTONES) {
      try {
        if (window.localStorage.getItem(storageKey(userId, m)) === "true") {
          seen.add(m);
        }
      } catch {
        /* private mode — без storage всё считается «не seen» */
      }
    }
    const milestone = pickHighestUnseenMilestone(streakDays, seen);
    if (milestone) setActiveMilestone(milestone);
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

  const achievement = MILESTONE_DESCRIPTIONS[activeMilestone ?? 7];
  return <Dialog open={activeMilestone !== null} onOpenChange={(open) => { if (!open) dismiss(); }}>
    <DialogContent className="max-w-sm p-8 text-center">
      <div className="mx-auto w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center text-5xl" aria-hidden="true">{achievement.emoji}</div>
      <DialogTitle className="text-2xl font-bold">{achievement.title}</DialogTitle>
      <DialogDescription>{achievement.subtitle}</DialogDescription>
      <div className="flex justify-center items-center gap-2 text-2xl font-bold tabular-nums text-primary">
        <Flame className="w-6 h-6" />{streakDays} {plural(streakDays, "день", "дня", "дней")}
      </div>
      <button type="button" onClick={dismiss} className="ui-button w-full h-12 rounded-xl bg-primary text-white font-semibold flex items-center justify-center gap-2">
        <Trophy className="w-5 h-5" />Продолжить смену
      </button>
    </DialogContent>
  </Dialog>;
}
