import { useMemo, useState } from "react";
import {
  Camera,
  Coffee,
  Heart,
  Lightbulb,
  ShieldCheck,
  Smile,
  Sparkles,
  ThumbsUp,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { pickByDayOfYear } from "@/lib/day-of-year";

/**
 * «Совет дня» — одна короткая фраза в день. Не реклама, не уведомление —
 * лёгкая практическая подсказка ИЛИ комплимент/мотивация. Воркер
 * видит каждый день что-то новое и не воспринимает интерфейс как
 * стерильный.
 *
 * Совет выбирается по `dayOfYear % TIPS.length` — стабильно за день,
 * меняется в полночь. Закрывается крестиком (флаг в localStorage,
 * сбрасывается на следующий день).
 */

type Tip = {
  text: string;
  icon: React.ReactNode;
  tone: "amber" | "emerald" | "violet" | "sky" | "rose";
};

const TIPS: Tip[] = [
  {
    text: "Закрывай задачу сразу после выполнения — пока помнишь все детали.",
    icon: <ThumbsUp className="w-5 h-5" />,
    tone: "emerald",
  },
  {
    text: "Хорошее фото — при дневном свете, без бликов. Кухонный потолок ок.",
    icon: <Camera className="w-5 h-5" />,
    tone: "sky",
  },
  {
    text: "Если устал — сделай паузу 5 минут. Лучше работать, чем спешить.",
    icon: <Coffee className="w-5 h-5" />,
    tone: "amber",
  },
  {
    text: "Не уверен в задаче — спроси коллегу или руководителя, это нормально.",
    icon: <Users className="w-5 h-5" />,
    tone: "violet",
  },
  {
    text: "Чистое рабочее место — ускоряет любую задачу в полтора раза.",
    icon: <Sparkles className="w-5 h-5" />,
    tone: "amber",
  },
  {
    text: "Помог коллеге — это часть смены, и руководитель это видит.",
    icon: <Heart className="w-5 h-5" />,
    tone: "rose",
  },
  {
    text: "Перед уходом проверь, что никаких пометок «Срочно» не осталось.",
    icon: <ShieldCheck className="w-5 h-5" />,
    tone: "emerald",
  },
  {
    text: "Улыбнись хотя бы раз — это бесплатно, а смена идёт легче.",
    icon: <Smile className="w-5 h-5" />,
    tone: "rose",
  },
  {
    text: "Спорный вопрос «делать или нет» решается в пользу «делать».",
    icon: <Wand2 className="w-5 h-5" />,
    tone: "violet",
  },
  {
    text: "Премия копится за каждую задачу — даже мелкие складываются в сумму.",
    icon: <Lightbulb className="w-5 h-5" />,
    tone: "amber",
  },
];

const TONE_STYLES: Record<Tip["tone"], string> = {
  amber:
    "from-amber-200/40 to-orange-200/30 border-amber-300/40 text-amber-900 dark:from-amber-500/15 dark:to-orange-500/10 dark:text-amber-100 dark:border-amber-500/30",
  emerald:
    "from-emerald-200/40 to-teal-200/30 border-emerald-300/40 text-emerald-900 dark:from-emerald-500/15 dark:to-teal-500/10 dark:text-emerald-100 dark:border-emerald-500/30",
  violet:
    "from-violet-200/40 to-purple-200/30 border-violet-300/40 text-violet-900 dark:from-violet-500/15 dark:to-purple-500/10 dark:text-violet-100 dark:border-violet-500/30",
  sky:
    "from-sky-200/40 to-blue-200/30 border-sky-300/40 text-sky-900 dark:from-sky-500/15 dark:to-blue-500/10 dark:text-sky-100 dark:border-sky-500/30",
  rose:
    "from-rose-200/40 to-pink-200/30 border-rose-300/40 text-rose-900 dark:from-rose-500/15 dark:to-pink-500/10 dark:text-rose-100 dark:border-rose-500/30",
};

function dayOfYearKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function TipOfTheDay() {
  const tip = useMemo(() => pickByDayOfYear(new Date(), TIPS), []);

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("tf_tip_dismiss_date") === dayOfYearKey();
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  return (
    <div
      className={`tip-of-day bg-gradient-to-br ${TONE_STYLES[tip.tone]}`}
      role="note"
    >
      <div className="tip-of-day-icon">{tip.icon}</div>
      <div className="tip-of-day-text">
        <div className="tip-of-day-label">Совет дня</div>
        <div className="tip-of-day-message">{tip.text}</div>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(
              "tf_tip_dismiss_date",
              dayOfYearKey(),
            );
          } catch {
            /* ignore */
          }
        }}
        className="tip-of-day-close"
        aria-label="Закрыть совет"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
