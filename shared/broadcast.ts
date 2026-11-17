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
export type BroadcastRecipient = { id: number; name: string; channels: BroadcastChannel[] };
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
