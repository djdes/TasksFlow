/**
 * Авторегистрация по email (лендинг, ветка как в ordersflow).
 *
 * Новый email → создаём компанию-заглушку + админа без телефона со
 * сгенерированным scrypt-паролем и magic-токеном. Пароль и ссылку
 * отправляем письмом через PHP, но пользователь УЖЕ залогинен (сессия
 * ставится в роуте) — на почту идти не обязательно.
 *
 * Название компании — из локальной части email как читаемая заглушка;
 * пользователь меняет его потом в кабинете.
 */
import { storage } from "./storage";
import {
  hashPassword,
  generatePassword,
  generateMagicToken,
} from "./crypto-password";
import type { User } from "@shared/schema";

export const MAGIC_TTL_SEC = 7 * 24 * 60 * 60; // 7 дней

function companyNameFromEmail(email: string): string {
  const local = (email.split("@")[0] || "").trim();
  if (!local) return "Моя компания";
  return `Компания ${local}`;
}

export interface AutoRegisterResult {
  user: User;
  password: string;
  magicToken: string;
}

/**
 * Создаёт компанию + админа по email. Возвращает пользователя, открытый
 * пароль (для письма) и magic-токен. Сессию ставит вызывающий роут.
 */
export async function autoRegisterByEmail(email: string): Promise<AutoRegisterResult> {
  const normalized = email.trim().toLowerCase();
  const password = generatePassword(12);
  const passwordHash = hashPassword(password);

  const company = await storage.createCompany({ name: companyNameFromEmail(normalized) });
  const localName = normalized.split("@")[0] || null;
  const user = await storage.createEmailUser({
    email: normalized,
    passwordHash,
    name: localName,
    companyId: company.id,
    isAdmin: true,
  });

  const magicToken = generateMagicToken();
  const expiresAt = Math.floor(Date.now() / 1000) + MAGIC_TTL_SEC;
  await storage.setMagicToken(user.id, magicToken, expiresAt);

  return { user, password, magicToken };
}
