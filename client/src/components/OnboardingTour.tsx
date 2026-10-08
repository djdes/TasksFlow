import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ListChecks, Coins, HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMotionPreference } from "@/contexts/MotionContext";

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
  const { reduced } = useMotionPreference();
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

  const current = STEPS[step ?? 0];
  const isLast = step === STEPS.length - 1;
  const progress = (((step ?? 0) + 1) / STEPS.length) * 100;

  return <Dialog open={step !== null} onOpenChange={(open) => { if (!open) dismiss(); }}>
    <DialogContent className="max-w-md p-6">
      <div className="h-1 bg-muted rounded-full overflow-hidden mr-8" aria-hidden="true">
        <motion.div className="h-full bg-primary" initial={false} animate={{ width: `${progress}%` }} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={reduced ? false : { opacity: 0, filter: "blur(3px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(3px)" }} transition={{ duration: reduced ? 0 : .12 }}>
          <div className="mt-3 flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center shrink-0">{current.icon}</div>
            <div className="flex-1 pt-1">
              <div className="text-xs font-medium text-muted-foreground">Шаг {(step ?? 0) + 1} из {STEPS.length}</div>
              <DialogTitle className="mt-1 text-xl font-bold leading-tight">{current.title}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="mt-4 text-sm leading-relaxed text-foreground/80">{current.body}</DialogDescription>
        </motion.div>
      </AnimatePresence>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={dismiss} className="ui-button min-h-11 text-sm text-muted-foreground">Пропустить</button>
        <button type="button" onClick={next} className="ui-button inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-primary text-white font-medium">
          {isLast ? "Начать!" : "Дальше"}<ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </DialogContent>
  </Dialog>;
}
