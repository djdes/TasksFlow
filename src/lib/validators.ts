import { z } from "zod";

// Max bytes for bcrypt — anything longer is silently truncated and wastes bandwidth.
const PASSWORD_MAX = 72;

export const loginSchema = z.object({
  email: z.string().email("Введите корректный email").max(320),
  password: z
    .string()
    .min(6, "Пароль должен содержать минимум 6 символов")
    .max(PASSWORD_MAX, `Пароль не должен превышать ${PASSWORD_MAX} символов`),
});

export const registerSchema = z.object({
  organizationName: z.string().min(2, "Название организации должно содержать минимум 2 символа").max(200),
  organizationType: z.enum(["meat", "dairy", "bakery", "confectionery", "other"], {
    message: "Выберите тип организации",
  }),
  name: z.string().min(2, "Имя должно содержать минимум 2 символа").max(100),
  email: z.string().email("Введите корректный email").max(320),
  password: z
    .string()
    .min(6, "Пароль должен содержать минимум 6 символов")
    .max(PASSWORD_MAX, `Пароль не должен превышать ${PASSWORD_MAX} символов`),
  phone: z.string().max(40).optional(),
});

export const journalEntrySchema = z.object({
  templateCode: z.string().min(1, "templateCode обязателен").max(100),
  areaId: z.string().min(1).max(100).optional(),
  equipmentId: z.string().min(1).max(100).optional(),
  data: z.record(z.string(), z.unknown()),
});

export const areaSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(200),
  description: z.string().max(1000).optional(),
});

export const equipmentSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(200),
  type: z.enum(["refrigerator", "freezer", "oven", "dishwasher", "scale", "thermometer", "other"], {
    message: "Выберите тип оборудования",
  }),
  serialNumber: z.string().max(100).optional(),
  tempMin: z.number().finite().optional(),
  tempMax: z.number().finite().optional(),
  tuyaDeviceId: z.string().max(100).optional(),
  areaId: z.string().min(1, "Выберите зону"),
});

export const competencySchema = z.object({
  userId: z.string().min(1).max(100),
  skill: z.string().min(1).max(100),
  level: z.number().int().min(0).max(3),
  expiresAt: z.string().datetime().optional().or(z.string().length(0)).or(z.null()).optional(),
  notes: z.string().max(1000).optional().or(z.null()),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
export type AreaInput = z.infer<typeof areaSchema>;
export type EquipmentInput = z.infer<typeof equipmentSchema>;
export type CompetencyInput = z.infer<typeof competencySchema>;

export const notificationPrefsSchema = z.object({
  temperature: z.boolean(),
  deviations: z.boolean(),
  compliance: z.boolean(),
});

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  temperature: true,
  deviations: true,
  compliance: true,
};
