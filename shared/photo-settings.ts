import { z } from "zod";

/**
 * Фото-отчёты компании.
 *   stamp      — ставить на фото дату и время съёмки (по умолчанию да):
 *                видно, когда сделан снимок, без разбора EXIF;
 *   cameraOnly — открывать сразу камеру, без выбора из галереи (по
 *                умолчанию нет): против вчерашних фото «на всякий случай».
 */
export type PhotoSettings = { stamp: boolean; cameraOnly: boolean };

export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = { stamp: true, cameraOnly: false };

export const photoSettingsSchema = z.object({ stamp: z.boolean(), cameraOnly: z.boolean() });

export function parsePhotoSettings(raw: string | null | undefined): PhotoSettings {
  if (!raw) return { ...DEFAULT_PHOTO_SETTINGS };
  try {
    const parsed = photoSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { ...DEFAULT_PHOTO_SETTINGS };
  } catch {
    return { ...DEFAULT_PHOTO_SETTINGS };
  }
}
