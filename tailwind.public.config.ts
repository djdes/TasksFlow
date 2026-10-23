import type { Config } from "tailwindcss";
import base from "./tailwind.config";

/**
 * Tailwind для публичного бандла (лендинг, блог, юр.страницы).
 * Тема и плагины — общие с кабинетом; content сужен, чтобы в CSS
 * лендинга не попадали утилиты страниц кабинета (client/src/pages).
 *
 * Общие компоненты (client/src/components) включены целиком: если форма
 * входа на лендинге начнёт использовать новый общий компонент, его классы
 * сгенерируются без правки этого файла. Исключены только крупные
 * компоненты, которые живут исключительно в кабинете.
 */
const CABINET_ONLY = [
  "TaskViewDialog",
  "TaskFormFiller",
  "GroupedTaskList",
  "JournalModeComposer",
  "JournalStepCard",
  "DuplicateTaskDialog",
  "EditTaskDialog",
  "CreateWorkerDialog",
  "EditWorkerDialog",
  "StatHero",
  "TelegramSection",
  "OnboardingTour",
  "TipOfTheDay",
  "StreakAchievement",
  "GreetingBanner",
  "VerificationBanner",
];

export default {
  ...base,
  content: [
    "./client/public.html",
    "./client/src/public/**/*.{js,jsx,ts,tsx}",
    "./client/src/components/**/*.{js,jsx,ts,tsx}",
    ...CABINET_ONLY.map((name) => `!./client/src/components/${name}.tsx`),
  ],
} satisfies Config;
