import { z } from "zod";

/**
 * «Отправить уведомление»: руководитель или админ пишет одному или многим
 * сотрудникам. Уходит push на все устройства и в Telegram, если бот привязан.
 */
export const BROADCAST_MAX_USERS = 200;
export const BROADCAST_TEXT_MAX = 500;

export const broadcastInputSchema = z.object({
  userIds: z
    .array(z.number().int().positive())
    .min(1, "Выберите хотя бы одного сотрудника")
    .max(BROADCAST_MAX_USERS, `Не больше ${BROADCAST_MAX_USERS} человек за раз`),
  text: z
    .string()
    .trim()
    .min(1, "Напишите текст уведомления")
    .max(BROADCAST_TEXT_MAX, `Не длиннее ${BROADCAST_TEXT_MAX} символов`),
});
export type BroadcastInput = z.infer<typeof broadcastInputSchema>;

export type BroadcastChannel = "push" | "telegram";
/**
 * Почему не дошло — чтобы руководитель знал, что сказать сотруднику:
 *   no-device   — ни один телефон не подписан в TasksFlow (разрешение в
 *                 настройках телефона само по себе подписку не делает);
 *   device-gone — телефон отписался (переустановка, очистка данных);
 *   push-failed — сервис уведомлений не принял;
 *   push-off    — способ доставки на это устройство не подключён на сервере.
 */
export type BroadcastReason = "no-device" | "device-gone" | "push-failed" | "push-off";
export type BroadcastRecipient = { id: number; name: string; channels: BroadcastChannel[]; reason?: BroadcastReason; telegram?: boolean };

/** Как человек получает уведомления — до отправки, в списке «Кому». */
export type BroadcastReach = { id: number; devices: number; telegram: boolean };

export const REASON_TEXT: Record<BroadcastReason, string> = {
  "no-device": "уведомления TasksFlow на телефоне не включены",
  "device-gone": "телефон отписался — включить уведомления заново",
  "push-failed": "сервис уведомлений не принял — включить уведомления заново",
  "push-off": "этот способ доставки пока не подключён",
};

/** Причина «не дошло» по итогу отправки на устройства человека. */
export function reasonOf(outcome: { devices: number; sent: number; removed: number; failed: number; skipped: number }): BroadcastReason {
  if (outcome.devices === 0) return "no-device";
  if (outcome.failed > 0) return "push-failed";
  if (outcome.removed > 0) return "device-gone";
  return "push-off";
}
export type BroadcastResult = {
  /** Получили хотя бы одним способом. */
  delivered: BroadcastRecipient[];
  /** Не дошло: нет ни push на устройстве, ни Telegram. */
  unreachable: BroadcastRecipient[];
};

/** Заготовки текста — одним касанием. */
export const BROADCAST_PRESETS: readonly string[] = [
  "Проверьте невыполненные задачи перед уходом",
  "Новые задачи на сегодня — откройте TasksFlow",
  "Не забудьте фото к задачам",
  "Срочно подойдите к руководителю",
];
