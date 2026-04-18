import { getBotMiniAppLabel, type RoleAccessActor } from "@/lib/role-access";

export type TelegramStartActor = RoleAccessActor & {
  name: string;
};

export type TelegramStartReply = {
  text: string;
  buttonLabel?: string;
  buttonUrl?: string;
};

export const TELEGRAM_COMMANDS = [
  {
    command: "start",
    description: "Открыть Wesetup",
  },
] as const;

export function buildTelegramLinkedStartReply(
  actor: TelegramStartActor,
  miniAppUrl: string | null
): TelegramStartReply {
  if (!miniAppUrl) {
    return {
      text: `Готово, ${actor.name}. Мини-приложение пока не настроено, свяжитесь с руководителем.`,
    };
  }

  return {
    text: `Готово, ${actor.name}! Откройте Wesetup кнопкой ниже.`,
    buttonLabel: getBotMiniAppLabel(actor),
    buttonUrl: miniAppUrl,
  };
}

export function buildTelegramUnlinkedStartReply(): TelegramStartReply {
  return {
    text: "Аккаунт пока не привязан. Откройте персональную ссылку из приглашения руководителя.",
  };
}
