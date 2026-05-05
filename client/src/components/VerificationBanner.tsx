import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { useAwaitingVerification } from "@/hooks/use-verification-queue";

/**
 * Компактный баннер на Dashboard для управленцев — «N задач ждут
 * вашей проверки». Раньше очередь была inline-блоком на dashboard'е,
 * визуально перемешиваясь с «моими задачами». Теперь дашборд
 * полностью посвящён ЛИЧНЫМ задачам заведующей; проверка отдельно
 * на /admin/verification.
 *
 * Если очередь пуста — баннер не рендерится. Скрывается когда
 * заведующая нажала на задачу и ушла на verification page.
 */
// Russian plural: учёт исключений 11-14 (которые звучат как «много»
// несмотря на оканчивание на 1/2/3/4). Раньше использовали грубую
// проверку count < 5 — для 21 ("Задача"), 22-24 ("Задачи") текст
// сваливался в "Заявок от сотрудников". У верификатора с 21+ submit'ов
// в очереди — некорректная плюрализация.
function pluralizeRu(count: number): "one" | "few" | "many" {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "many";
  if (last === 1) return "one";
  if (last >= 2 && last <= 4) return "few";
  return "many";
}

export function VerificationBanner() {
  const [, setLocation] = useLocation();
  const { data: tasks = [], isLoading } = useAwaitingVerification();

  if (isLoading) return null;
  const count = tasks.length;
  if (count === 0) return null;
  const form = pluralizeRu(count);
  const subtitle =
    form === "one"
      ? "Задача от сотрудника ждёт одобрения"
      : form === "few"
        ? "Задачи от сотрудников ждут одобрения"
        : "Задач от сотрудников ждут одобрения";

  return (
    <AnimatePresence>
      <motion.button
        type="button"
        onClick={() => setLocation("/admin/verification")}
        className="verification-banner"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.985 }}
      >
        <div className="verification-banner-icon">
          <ShieldCheck className="w-5 h-5" />
          <span className="verification-banner-pulse" />
        </div>
        <div className="verification-banner-text">
          <div className="verification-banner-title">
            На проверке: {count}
          </div>
          <div className="verification-banner-subtitle">
            {subtitle}
          </div>
        </div>
        <div className="verification-banner-cta">
          <span>Открыть</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </motion.button>
    </AnimatePresence>
  );
}
