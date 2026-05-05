import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X, ListChecks, Coins, HelpCircle, Sparkles } from "lucide-react";

/**
 * Простой 4-шаговый onboarding для нового воркера. Не лезет в DOM
 * (никаких popper'ов / portal'ов на конкретные элементы) — серия
 * fullscreen-модалок «изучите интерфейс». Это надёжнее: даже если
 * Dashboard layout поменяется, обучение не сломается.
 *
 * Запуск: tf_onboarded ≠ "true" в localStorage. После закрытия
 * (любым способом) флаг записывается, повторно не показывается.
 *
 * Только воркеру (admin'у не нужен — у него и так много экранов
 * управления, gating на стороне родителя).
 */

const STORAGE_KEY = "tf_onboarded_v1";

const STEPS = [
  {
    icon: <ListChecks className="w-10 h-10 text-primary" />,
    title: "Здесь твои задачи на сегодня",
    body:
      "Каждый день программа покажет именно то, что нужно сделать. Не больше и не меньше — никакой путаницы.",
  },
  {
    icon: (
      <div className="w-10 h-10 rounded-full border-4 border-primary flex items-center justify-center">
        <span className="block w-3 h-3 rounded-full bg-primary" />
      </div>
    ),
    title: "Тапни круг слева — и задача закрыта",
    body:
      "Если требуется фото, программа сама откроет камеру. Если форма — заполни поля и жми «Готово». Программа подсветит, что заполнено правильно.",
  },
  {
    icon: <Coins className="w-10 h-10 text-amber-500" />,
    title: "За задачи копится премия",
    body:
      "Каждая выполненная задача — плюс к балансу премии. Выплаты 1 и 16 числа. Стрик подряд закрытых дней — бонус к мотивации.",
  },
  {
    icon: <HelpCircle className="w-10 h-10 text-emerald-600" />,
    title: "Если запутался — жми «?»",
    body:
      "Кнопка «?» внизу справа открывает помощь с пошаговыми инструкциями. И не стесняйся спросить руководителя — это нормально.",
  },
];

export function OnboardingTour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      /* ignore */
    }
    if (!seen) {
      // Маленькая задержка чтобы dashboard успел отрисоваться — иначе
      // сразу полноэкранный модал на голом экране пугает.
      const t = window.setTimeout(() => setStep(0), 600);
      return () => window.clearTimeout(t);
    }
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* ignore */
    }
    setStep(null);
  }

  function next() {
    if (step === null) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  }

  if (step === null) return null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="onboarding"
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={dismiss}
      >
        <motion.div
          key={step}
          className="relative max-w-md w-full rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Прогресс-бар */}
          <div className="absolute top-0 inset-x-0 h-1 bg-muted rounded-t-3xl overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-primary/70"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>

          <button
            type="button"
            onClick={dismiss}
            className="absolute right-3 top-3 w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
            aria-label="Пропустить"
            title="Пропустить (можно открыть в любой момент через «?»)"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="mt-4 flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center shrink-0">
              {current.icon}
            </div>
            <div className="flex-1 pt-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Sparkles className="w-3 h-3" />
                Шаг {step + 1} из {STEPS.length}
              </div>
              <h2 className="mt-1 text-xl font-bold text-foreground leading-tight">
                {current.title}
              </h2>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-foreground/80">
            {current.body}
          </p>

          <div className="mt-6 flex items-center gap-2">
            {/* Точки шагов */}
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`block w-2 h-2 rounded-full transition-colors ${
                    i === step
                      ? "bg-primary"
                      : i < step
                        ? "bg-primary/50"
                        : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Пропустить
            </button>
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 h-10 px-5 rounded-2xl bg-gradient-to-r from-primary to-primary/90 text-white text-sm font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-95 transition-all"
            >
              {isLast ? "Начать!" : "Дальше"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
