import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
});

export const registerSchema = z.object({
  organizationName: z.string().min(2, "Название организации должно содержать минимум 2 символа"),
  organizationType: z.enum(["meat", "dairy", "bakery", "confectionery", "other"], {
    message: "Выберите тип организации",
  }),
  name: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
  phone: z.string().optional(),
});

export const journalEntrySchema = z.object({
  templateId: z.string(),
  areaId: z.string().optional(),
  equipmentId: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

export const areaSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  description: z.string().optional(),
});

export const equipmentSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  type: z.enum(["refrigerator", "freezer", "oven", "dishwasher", "scale", "thermometer", "other"], {
    message: "Выберите тип оборудования",
  }),
  serialNumber: z.string().optional(),
  tempMin: z.number().optional(),
  tempMax: z.number().optional(),
  areaId: z.string().min(1, "Выберите зону"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type JournalEntryInput = z.infer<typeof journalEntrySchema>;
export type AreaInput = z.infer<typeof areaSchema>;
export type EquipmentInput = z.infer<typeof equipmentSchema>;
