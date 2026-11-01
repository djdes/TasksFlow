import "dotenv/config";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function createAdmin() {
  try {
    // Телефон — аргументом или из окружения, не в коде: репозиторий публичный.
    //   npm run create-admin -- --phone=+79991234567   (или ADMIN_PHONE=+7…)
    const arg = process.argv.find((a) => a.startsWith("--phone="))?.slice("--phone=".length);
    const adminPhone = (arg ?? process.env.ADMIN_PHONE ?? "").replace(/[\s()-]/g, "");
    if (!/^\+7\d{10}$/.test(adminPhone)) {
      console.error("Укажите телефон: npm run create-admin -- --phone=+7XXXXXXXXXX (или ADMIN_PHONE)");
      process.exit(1);
    }
    
    // Проверяем, существует ли уже админ
    const [existing] = await db.select().from(users).where(eq(users.phone, adminPhone));
    
    if (existing) {
      console.log("Админ с номером", adminPhone, "уже существует");
      // Обновляем на админа, если не админ
      if (!existing.isAdmin) {
        await db.update(users).set({ isAdmin: true }).where(eq(users.id, existing.id));
        console.log("Пользователь обновлен до администратора");
      }
      return;
    }

    // Создаем нового админа
    const [result] = await db.insert(users).values({
      phone: adminPhone,
      name: "Администратор",
      isAdmin: true,
      createdAt: Math.floor(Date.now() / 1000),
    });

    const insertId = (result as any).insertId;
    console.log("Админ создан с ID:", insertId, "и номером:", adminPhone);
  } catch (error) {
    console.error("Ошибка при создании админа:", error);
    // process.exitCode вместо process.exit(1) — иначе finally
    // переопределит exit на 0 и CI/deploy не увидит failure.
    process.exitCode = 1;
  }
  // finally с process.exit(0) убран: Node сам выходит с правильным
  // exit code когда event-loop drain'ится.
}

createAdmin();
